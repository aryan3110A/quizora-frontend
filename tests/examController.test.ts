import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api";
import { ExamController, type ExamControllerOptions } from "@/lib/exam/examController";
import { memoryPendingStore } from "@/lib/exam/storage";
import {
  attemptPayload, closedError, deferred, FakeExamApi, networkError, staleError
} from "./helpers/fakeExamApi";

const T0 = 1_800_000_000_000;

/** Starts a controller against a scripted server. `clientSkewMs` makes the BROWSER clock wrong relative to the server's. */
async function startController(
  api: FakeExamApi,
  opts: { clientSkewMs?: number; options?: Partial<ExamControllerOptions> } = {}
) {
  vi.setSystemTime(T0 + (opts.clientSkewMs ?? 0));
  const controller = new ExamController({
    quizId: "quiz-1",
    api,
    mono: () => Date.now(),
    wallNow: () => Date.now(),
    tickMs: 250,
    statusPollMs: 30_000,
    ...opts.options
  });
  await controller.start();
  return controller;
}

const advance = (ms: number) => vi.advanceTimersByTimeAsync(ms);

describe("ExamController", () => {
  let api: FakeExamApi;
  beforeEach(() => {
    vi.useFakeTimers();
    api = new FakeExamApi();
    api.onStatus = () => ({ status: "IN_PROGRESS", finalized: false, expired: false, deadlineAt: "", serverTime: new Date(Date.now()).toISOString() });
  });
  afterEach(() => vi.useRealTimers());

  describe("server-authoritative timer", () => {
    it("derives the countdown from the server's clock, not the browser's", async () => {
      for (const skew of [-3_600_000, 0, 7_200_000]) {
        const a = new FakeExamApi();
        a.onStart = () => attemptPayload({ serverTimeMs: T0, deadlineInMs: 60_000 });
        a.onStatus = () => ({ status: "IN_PROGRESS", finalized: false, expired: false, deadlineAt: "", serverTime: new Date(T0).toISOString() });
        // The server reports T0 no matter what the browser thinks the time is.
        const c = await startController(a, { clientSkewMs: skew });
        expect(c.getSnapshot().remainingSeconds, `skew ${skew}`).toBe(60);
        c.stop();
      }
    });

    it("counts down while the page is open", async () => {
      api.onStart = () => attemptPayload({ serverTimeMs: T0, deadlineInMs: 60_000 });
      const c = await startController(api);
      await advance(10_000);
      expect(c.getSnapshot().remainingSeconds).toBe(50);
      c.stop();
    });

    it("does not reset on browser refresh: a new page load resumes from the SAME deadline", async () => {
      const deadline = T0 + 60_000;
      api.onStart = () => attemptPayload({ serverTimeMs: Date.now(), deadlineInMs: deadline - Date.now() });
      const first = await startController(api);
      await advance(20_000);
      expect(first.getSnapshot().remainingSeconds).toBe(40);
      first.stop(); // the page is closed/refreshed

      const reloaded = new ExamController({ quizId: "quiz-1", api, mono: () => Date.now(), wallNow: () => Date.now() });
      await reloaded.start();
      expect(reloaded.getSnapshot().remainingSeconds).toBe(40); // not 60
      reloaded.stop();
    });

    it("two tabs on the same attempt show the same remaining time", async () => {
      const deadline = T0 + 90_000;
      api.onStart = () => attemptPayload({ serverTimeMs: Date.now(), deadlineInMs: deadline - Date.now() });
      const tabA = await startController(api);
      await advance(5_000);
      const tabB = new ExamController({ quizId: "quiz-1", api, mono: () => Date.now(), wallNow: () => Date.now() });
      await tabB.start();
      expect(tabB.getSnapshot().remainingSeconds).toBe(tabA.getSnapshot().remainingSeconds);
      tabA.stop();
      tabB.stop();
    });

    it("re-aligns with the server on the periodic status check", async () => {
      api.onStart = () => attemptPayload({ serverTimeMs: T0, deadlineInMs: 120_000 });
      const c = await startController(api); // the fake browser clock starts at T0, the same instant the server reported
      // 30 s later the server says 5 s MORE have elapsed than the browser measured (e.g. the laptop slept).
      api.onStatus = () => ({ status: "IN_PROGRESS", finalized: false, expired: false, deadlineAt: "", serverTime: new Date(Date.now() + 5_000).toISOString() });
      await advance(30_000);
      expect(c.getSnapshot().remainingSeconds).toBe(85); // 120 - 30 - 5
      c.stop();
    });
  });

  describe("automatic submission at the deadline", () => {
    it("submits automatically exactly once when time runs out and leaves for the results page", async () => {
      api.onStart = () => attemptPayload({ serverTimeMs: T0, deadlineInMs: 10_000 });
      const c = await startController(api);
      await advance(9_000);
      expect(api.count("submit")).toBe(0);
      await advance(2_000);
      expect(api.count("submit")).toBe(1);
      const snap = c.getSnapshot();
      expect(snap.phase).toBe("submitted");
      expect(snap.redirectTo).toBe("/results/attempt-1");
      await advance(60_000);
      expect(api.count("submit")).toBe(1); // never again
      c.stop();
    });

    it("shows time-up and refuses new choices once the deadline is reached", async () => {
      api.onStart = () => attemptPayload({ serverTimeMs: T0, deadlineInMs: 5_000 });
      api.onSubmit = () => new Promise<void>(() => undefined); // submission still in progress
      const c = await startController(api);
      await advance(5_100);
      expect(c.getSnapshot().timeUp).toBe(true);
      expect(c.getSnapshot().remainingSeconds).toBe(0);
      c.choose("q1", "q1-a");
      expect(api.count("saveAnswer")).toBe(0);
      expect(c.getSnapshot().answers).toEqual({});
      c.stop();
    });

    it("keeps retrying the automatic submission while offline, then succeeds", async () => {
      api.onStart = () => attemptPayload({ serverTimeMs: T0, deadlineInMs: 5_000 });
      let failures = 0;
      api.onSubmit = () => {
        if (failures++ < 4) throw networkError();
      };
      const c = await startController(api);
      await advance(5_100);
      expect(c.getSnapshot().offline).toBe(true);
      expect(c.getSnapshot().phase).toBe("active");
      await advance(3_000 * 4 + 500); // fixed 3 s retry interval, no give-up
      expect(api.count("submit")).toBe(5);
      expect(c.getSnapshot().phase).toBe("submitted");
      expect(c.getSnapshot().offline).toBe(false);
      c.stop();
    });

    it("trusts the server's 'expired' even when the browser clock thinks there is time left", async () => {
      api.onStart = () => attemptPayload({ serverTimeMs: T0, deadlineInMs: 600_000 });
      const c = await startController(api);
      api.onStatus = () => ({ status: "IN_PROGRESS", finalized: false, expired: true, deadlineAt: "", serverTime: new Date(Date.now()).toISOString() });
      await advance(30_000);
      expect(api.count("submit")).toBe(1);
      expect(c.getSnapshot().phase).toBe("submitted");
      c.stop();
    });

    it("finishes when a save is refused because the attempt closed at the deadline", async () => {
      api.onStart = () => attemptPayload({ serverTimeMs: T0, deadlineInMs: 600_000 });
      api.onSave = () => {
        throw closedError();
      };
      const c = await startController(api);
      c.choose("q1", "q1-a");
      await advance(10);
      expect(api.count("submit")).toBe(1);
      expect(c.getSnapshot().phase).toBe("submitted");
      c.stop();
    });
  });

  describe("manual submission", () => {
    it("saves pending answers BEFORE submitting", async () => {
      api.onStart = () => attemptPayload({ serverTimeMs: T0 });
      const gate = deferred<{ serverTime?: string }>();
      api.onSave = () => gate.promise;
      const c = await startController(api);
      c.choose("q1", "q1-a");
      const submitting = c.submit("manual");
      await advance(100);
      expect(api.count("submit")).toBe(0); // still waiting for the save
      gate.resolve({});
      await expect(submitting).resolves.toBe("submitted");
      expect(api.calls.map((x) => x.method).filter((m) => m !== "status")).toEqual(["start", "saveAnswer", "submit"]);
      c.stop();
    });

    it("holds back when answers cannot be saved, and 'submit anyway' goes through", async () => {
      api.onStart = () => attemptPayload({ serverTimeMs: T0 });
      api.onSave = () => {
        throw networkError();
      };
      const c = await startController(api);
      c.choose("q1", "q1-a");
      await advance(10);
      const blocked = await c.submit("manual");
      expect(blocked).toBe("blocked");
      expect(api.count("submit")).toBe(0);
      expect(c.getSnapshot().submitBlocked).toBe(true);
      expect(c.getSnapshot().submitError).toMatch(/not been saved/);
      expect(c.getSnapshot().phase).toBe("active");

      await expect(c.submit("manual", { force: true })).resolves.toBe("submitted");
      expect(api.count("submit")).toBe(1);
      c.stop();
    });

    it("retries a failed submission, then reports failure so the student can try again", async () => {
      api.onStart = () => attemptPayload({ serverTimeMs: T0 });
      api.onSubmit = () => {
        throw networkError();
      };
      const c = await startController(api);
      const result = c.submit("manual");
      await advance(10_000);
      await expect(result).resolves.toBe("failed");
      expect(api.count("submit")).toBe(3);
      expect(c.getSnapshot().submitError).toMatch(/Submission failed/);
      expect(c.getSnapshot().phase).toBe("active");

      api.onSubmit = () => undefined; // connection is back
      await expect(c.submit("manual")).resolves.toBe("submitted");
      c.stop();
    });
  });

  describe("idempotent submission", () => {
    it("manual clicks, an automatic submit and repeated calls share one request", async () => {
      api.onStart = () => attemptPayload({ serverTimeMs: T0, deadlineInMs: 3_000 });
      const gate = deferred<void>();
      api.onSubmit = () => gate.promise;
      const c = await startController(api);
      const clicks = [c.submit("manual"), c.submit("manual"), c.submit("manual")];
      await advance(4_000); // the deadline passes: the automatic submit fires too
      gate.resolve();
      const results = await Promise.all(clicks);
      expect(results).toEqual(["submitted", "submitted", "submitted"]);
      expect(api.count("submit")).toBe(1);
      expect(await c.submit("manual")).toBe("done"); // after finishing: a no-op
      expect(api.count("submit")).toBe(1);
      c.stop();
    });

    it("another tab submitted first: this tab notices through the status check and just leaves", async () => {
      api.onStart = () => attemptPayload({ serverTimeMs: T0, deadlineInMs: 600_000 });
      const c = await startController(api);
      api.onStatus = () => ({ status: "SUBMITTED", finalized: true, expired: false, deadlineAt: "", serverTime: new Date(Date.now()).toISOString() });
      await advance(30_000);
      expect(c.getSnapshot().phase).toBe("submitted");
      expect(c.getSnapshot().redirectTo).toBe("/results/attempt-1");
      expect(api.count("submit")).toBe(0); // nothing left to submit
      c.stop();
    });

    it("treats 'attempt already closed' on submit as done", async () => {
      api.onStart = () => attemptPayload({ serverTimeMs: T0 });
      api.onSubmit = () => {
        throw closedError();
      };
      const c = await startController(api);
      await expect(c.submit("manual")).resolves.toBe("submitted");
      c.stop();
    });
  });

  describe("answers", () => {
    it("saves a choice with a sequence number and shows the saved state", async () => {
      api.onStart = () => attemptPayload({ serverTimeMs: T0 });
      const c = await startController(api);
      c.choose("q1", "q1-b");
      expect(c.getSnapshot().answers).toEqual({ q1: "q1-b" });
      await advance(10);
      expect(api.saves()).toEqual([{ questionId: "q1", option: "q1-b", seq: expect.any(Number) }]);
      expect(c.getSnapshot().saveStatus.q1).toBe("saved");
      c.stop();
    });

    it("shows failed saves, retries them, and goes back to normal", async () => {
      api.onStart = () => attemptPayload({ serverTimeMs: T0 });
      let fail = true;
      api.onSave = () => {
        if (fail) throw networkError();
        return {};
      };
      const c = await startController(api);
      c.choose("q1", "q1-a");
      await advance(10);
      expect(c.getSnapshot()).toMatchObject({ offline: true, failedCount: 1 });
      expect(c.getSnapshot().saveStatus.q1).toBe("failed");
      expect(c.getSnapshot().answers.q1).toBe("q1-a"); // the student's choice is never taken away

      fail = false;
      c.onOnline(); // the browser reports the connection is back
      await advance(10);
      expect(c.getSnapshot()).toMatchObject({ offline: false, failedCount: 0 });
      expect(c.getSnapshot().saveStatus.q1).toBe("saved");
      c.stop();
    });

    it("restores answers after a refresh: server state plus choices that never reached the server", async () => {
      api.onStart = () => attemptPayload({ serverTimeMs: T0, answers: { q1: "q1-a", q2: null }, answerSeqs: { q1: 10 } });
      const store = memoryPendingStore({
        q3: { selectedOptionId: "q3-c", seq: 500 }, // chosen offline before the refresh
        q1: { selectedOptionId: "q1-z", seq: 5 } // older than what the server holds: must lose
      });
      const c = await startController(api, { options: { createStore: () => store } });
      expect(c.getSnapshot().answers).toEqual({ q1: "q1-a", q3: "q3-c" });
      await advance(10);
      expect(api.saves()).toEqual([{ questionId: "q3", option: "q3-c", seq: 500 }]); // re-sent with its original number
      expect(store.snapshot()).toEqual({});
      c.stop();
    });

    it("adopts a newer answer saved from another tab", async () => {
      api.onStart = () => attemptPayload({ serverTimeMs: T0 });
      api.onSave = () => {
        throw staleError("q1-d", 4_000_000_000_000);
      };
      const c = await startController(api);
      c.choose("q1", "q1-a");
      await advance(10);
      expect(c.getSnapshot().answers.q1).toBe("q1-d");
      expect(c.getSnapshot().failedCount).toBe(0);
      c.stop();
    });
  });

  describe("starting the attempt", () => {
    it("sends the student to sign in on 401", async () => {
      api.onStart = () => {
        throw new ApiError("Please sign in.", 401, "UNAUTHENTICATED");
      };
      const c = await startController(api);
      expect(c.getSnapshot().phase).toBe("unauthenticated");
    });

    it("reports an attempt that has already ended instead of showing a broken quiz", async () => {
      api.onStart = () => {
        throw new ApiError("The deadline has passed.", 409, "ATTEMPT_EXPIRED");
      };
      const c = await startController(api);
      expect(c.getSnapshot()).toMatchObject({ phase: "ended", error: "The deadline has passed." });
    });

    it("reports a network failure and can be restarted", async () => {
      let up = false;
      api.onStart = () => {
        if (!up) throw networkError();
        return attemptPayload({ serverTimeMs: T0 });
      };
      const c = await startController(api);
      expect(c.getSnapshot().phase).toBe("error");
      up = true;
      await c.restart();
      expect(c.getSnapshot().phase).toBe("active");
      c.stop();
    });

    it("survives React Strict Mode's mount / unmount / mount without double timers or double submits", async () => {
      api.onStart = () => attemptPayload({ serverTimeMs: T0, deadlineInMs: 5_000 });
      vi.setSystemTime(T0);
      const c = new ExamController({ quizId: "quiz-1", api, mono: () => Date.now(), wallNow: () => Date.now() });
      void c.start();
      c.stop();
      await c.start();
      await advance(6_000);
      expect(api.count("submit")).toBe(1);
      expect(c.getSnapshot().phase).toBe("submitted");
      c.stop();
    });
  });
});
