import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AnswerSync, type AnswerSyncOptions, type SaveOutcome } from "@/lib/exam/answerSync";
import { memoryPendingStore } from "@/lib/exam/storage";
import { deferred, type Deferred } from "./helpers/fakeExamApi";

type Send = AnswerSyncOptions["send"];

function setup(send: Send, extra: Partial<AnswerSyncOptions> = {}) {
  const store = memoryPendingStore();
  const onRemoteAnswer = vi.fn();
  const onClosed = vi.fn();
  const sync = new AnswerSync({ send, store, wallNow: () => 1_000, onRemoteAnswer, onClosed, ...extra });
  return { sync, store, onRemoteAnswer, onClosed };
}
const saved: SaveOutcome = { kind: "saved" };
const flushMicrotasks = () => vi.advanceTimersByTimeAsync(0);

describe("AnswerSync", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("saves a chosen answer with a sequence number and reports it saved", async () => {
    const send = vi.fn<Send>(async () => saved);
    const { sync } = setup(send);
    sync.setAnswer("q1", "q1-a");
    expect(sync.getStatus("q1")).toBe("saving");
    await flushMicrotasks();
    expect(sync.getStatus("q1")).toBe("saved");
    expect(send).toHaveBeenCalledWith("q1", "q1-a", expect.any(Number));
    expect(sync.unsavedQuestions()).toEqual([]);
  });

  it("never has two saves in flight for one question and sends only the latest choice", async () => {
    const pending: Array<Deferred<SaveOutcome>> = [];
    let inflight = 0;
    let maxInflight = 0;
    const send = vi.fn<Send>(() => {
      inflight++;
      maxInflight = Math.max(maxInflight, inflight);
      const d = deferred<SaveOutcome>();
      pending.push(d);
      return d.promise.finally(() => inflight--);
    });
    const { sync } = setup(send);

    sync.setAnswer("q1", "q1-a");
    sync.setAnswer("q1", "q1-b"); // chosen while "a" is still in flight
    sync.setAnswer("q1", "q1-c"); // ...and again
    expect(send).toHaveBeenCalledTimes(1);

    pending[0].resolve(saved);
    await flushMicrotasks();
    expect(send).toHaveBeenCalledTimes(2); // "b" was skipped: only the latest follows
    expect(send.mock.calls[1][1]).toBe("q1-c");
    pending[1].resolve(saved);
    await flushMicrotasks();

    expect(maxInflight).toBe(1);
    expect(sync.getStatus("q1")).toBe("saved");
    const seqs = send.mock.calls.map((c) => c[2]);
    expect(seqs[1]).toBeGreaterThan(seqs[0]);
  });

  it("saves different questions in parallel", async () => {
    const send = vi.fn<Send>(() => new Promise<SaveOutcome>(() => undefined));
    const { sync } = setup(send);
    sync.setAnswer("q1", "q1-a");
    sync.setAnswer("q2", "q2-a");
    expect(send).toHaveBeenCalledTimes(2);
  });

  it("keeps a failed answer and retries it with exponential back-off until it succeeds", async () => {
    const results: SaveOutcome[] = [{ kind: "retry", error: "offline" }, { kind: "retry", error: "offline" }, saved];
    const send = vi.fn<Send>(async () => results.shift() ?? saved);
    const { sync } = setup(send);

    sync.setAnswer("q1", "q1-a");
    await flushMicrotasks();
    expect(sync.getStatus("q1")).toBe("failed");
    expect(sync.failedCount).toBe(1);
    expect(sync.unsavedQuestions()).toEqual(["q1"]);

    await vi.advanceTimersByTimeAsync(999);
    expect(send).toHaveBeenCalledTimes(1); // first back-off is 1 s
    await vi.advanceTimersByTimeAsync(1);
    expect(send).toHaveBeenCalledTimes(2);
    expect(sync.getStatus("q1")).toBe("failed");

    await vi.advanceTimersByTimeAsync(1_999);
    expect(send).toHaveBeenCalledTimes(2); // second back-off is 2 s
    await vi.advanceTimersByTimeAsync(1);
    expect(send).toHaveBeenCalledTimes(3);
    expect(sync.getStatus("q1")).toBe("saved");
    expect(sync.failedCount).toBe(0);
    // every attempt re-sent the SAME sequence number: a retry is idempotent for the server
    expect(new Set(send.mock.calls.map((c) => c[2])).size).toBe(1);
  });

  it("survives a network outage: answers are kept and saved the moment the connection returns", async () => {
    let online = false;
    const send = vi.fn<Send>(async () => (online ? saved : { kind: "retry", error: "offline" }));
    const { sync } = setup(send);
    sync.setAnswer("q1", "q1-a");
    sync.setAnswer("q2", "q2-b");
    await flushMicrotasks();
    expect(sync.failedCount).toBe(2);

    online = true;
    sync.retryNow(); // the browser's "online" event, or the student's "Retry now"
    await flushMicrotasks();
    expect(sync.failedCount).toBe(0);
    expect(sync.getStatus("q1")).toBe("saved");
    expect(sync.getStatus("q2")).toBe("saved");
  });

  it("a rejected promise (unexpected error) is treated as retryable, never as data loss", async () => {
    const send = vi.fn<Send>().mockRejectedValueOnce(new Error("boom")).mockResolvedValue(saved);
    const { sync } = setup(send);
    sync.setAnswer("q1", "q1-a");
    await flushMicrotasks();
    expect(sync.getStatus("q1")).toBe("failed");
    await vi.advanceTimersByTimeAsync(1_000);
    expect(sync.getStatus("q1")).toBe("saved");
  });

  it("a new choice while a retry is waiting replaces the failed one immediately", async () => {
    const send = vi.fn<Send>().mockResolvedValueOnce({ kind: "retry", error: "x" }).mockResolvedValue(saved);
    const { sync } = setup(send);
    sync.setAnswer("q1", "q1-a");
    await flushMicrotasks();
    sync.setAnswer("q1", "q1-b"); // no need to wait for the timer
    await flushMicrotasks();
    expect(send.mock.calls[1][1]).toBe("q1-b");
    expect(sync.getStatus("q1")).toBe("saved");
    await vi.advanceTimersByTimeAsync(60_000);
    expect(send).toHaveBeenCalledTimes(2); // the old retry timer was cancelled
  });

  it("does not auto-retry a request the server refused (fatal) but retries when asked", async () => {
    const send = vi.fn<Send>().mockResolvedValueOnce({ kind: "fatal", error: "invalid" }).mockResolvedValue(saved);
    const { sync } = setup(send);
    sync.setAnswer("q1", "q1-a");
    await flushMicrotasks();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(send).toHaveBeenCalledTimes(1);
    expect(sync.getStatus("q1")).toBe("failed");
    sync.retryNow("q1");
    await flushMicrotasks();
    expect(sync.getStatus("q1")).toBe("saved");
  });

  it("gives every choice a strictly increasing sequence, continuing from what the server already holds", async () => {
    const send = vi.fn<Send>(async () => saved);
    const { sync } = setup(send, { wallNow: () => 1_000 });
    sync.seed({ q1: 5_000 }); // e.g. saved earlier, possibly from another tab with a later clock
    sync.setAnswer("q1", "q1-a");
    await flushMicrotasks();
    sync.setAnswer("q1", "q1-b");
    await flushMicrotasks();
    expect(send.mock.calls.map((c) => c[2])).toEqual([5_001, 5_002]);
  });

  it("uses the wall clock when it is ahead, so tabs of one browser order their choices by real time", async () => {
    let now = 10_000;
    const send = vi.fn<Send>(async () => saved);
    const { sync } = setup(send, { wallNow: () => now });
    sync.setAnswer("q1", "q1-a");
    await flushMicrotasks();
    now = 20_000;
    sync.setAnswer("q1", "q1-b");
    await flushMicrotasks();
    expect(send.mock.calls.map((c) => c[2])).toEqual([10_000, 20_000]);
  });

  describe("an older request arriving after a newer one (out-of-order delivery)", () => {
    it("adopts the server's newer answer when another tab saved after us", async () => {
      const send = vi.fn<Send>(async () => ({ kind: "superseded", current: { selectedOptionId: "q1-d", seq: 9_999 } }));
      const { sync, onRemoteAnswer } = setup(send);
      sync.setAnswer("q1", "q1-a");
      await flushMicrotasks();
      expect(onRemoteAnswer).toHaveBeenCalledWith("q1", "q1-d", 9_999);
      expect(sync.getStatus("q1")).toBe("saved"); // not an error: the server simply has something newer
      expect(sync.unsavedQuestions()).toEqual([]);
    });

    it("re-sends our newest choice if it is still newer than what the server reported", async () => {
      const first = deferred<SaveOutcome>();
      const send = vi.fn<Send>().mockReturnValueOnce(first.promise).mockResolvedValue(saved);
      const { sync, onRemoteAnswer } = setup(send, { wallNow: () => 1_000 });
      sync.setAnswer("q1", "q1-a"); // seq 1000
      sync.setAnswer("q1", "q1-b"); // seq 1001, waiting behind the first
      first.resolve({ kind: "superseded", current: { selectedOptionId: "q1-z", seq: 1_000 } });
      await flushMicrotasks();
      expect(send).toHaveBeenCalledTimes(2);
      expect(send.mock.calls[1]).toEqual(["q1", "q1-b", 1_001]);
      expect(onRemoteAnswer).not.toHaveBeenCalled();
      expect(sync.getStatus("q1")).toBe("saved");
    });
  });

  describe("refresh recovery", () => {
    it("persists unacknowledged answers and clears them once the server has them", async () => {
      const gate = deferred<SaveOutcome>();
      const send = vi.fn<Send>(() => gate.promise);
      const { sync, store } = setup(send);
      sync.setAnswer("q1", "q1-a");
      expect(store.snapshot()).toEqual({ q1: { selectedOptionId: "q1-a", seq: 1_000 } });
      gate.resolve(saved);
      await flushMicrotasks();
      expect(store.snapshot()).toEqual({});
    });

    it("after a refresh, re-sends what never arrived using its ORIGINAL sequence number", async () => {
      const store = memoryPendingStore({ q1: { selectedOptionId: "q1-a", seq: 500 } });
      const send = vi.fn<Send>(async () => saved);
      const sync = new AnswerSync({ send, store, wallNow: () => 9_999_999 });
      sync.seed({});
      const restored = sync.restore();
      await flushMicrotasks();
      expect(restored).toEqual({ q1: { selectedOptionId: "q1-a", seq: 500 } });
      expect(send).toHaveBeenCalledWith("q1", "q1-a", 500); // not renumbered: a stale one is still recognised as stale
      expect(store.snapshot()).toEqual({});
    });

    it("drops a remembered answer the server already holds newer (for example saved from another device)", async () => {
      const store = memoryPendingStore({ q1: { selectedOptionId: "q1-a", seq: 500 }, q2: { selectedOptionId: "q2-b", seq: 800 } });
      const send = vi.fn<Send>(async () => saved);
      const sync = new AnswerSync({ send, store });
      sync.seed({ q1: 600 }); // the server holds seq 600 for q1: ours (500) is older
      const restored = sync.restore();
      await flushMicrotasks();
      expect(Object.keys(restored)).toEqual(["q2"]);
      expect(send).toHaveBeenCalledTimes(1);
      expect(send).toHaveBeenCalledWith("q2", "q2-b", 800);
    });
  });

  describe("flush (used before submission)", () => {
    it("resolves immediately when everything is saved", async () => {
      const { sync } = setup(async () => saved);
      await expect(sync.flush()).resolves.toEqual({ ok: true, unsaved: [] });
    });

    it("waits for answers still being saved", async () => {
      const gate = deferred<SaveOutcome>();
      const { sync } = setup(() => gate.promise);
      sync.setAnswer("q1", "q1-a");
      let done = false;
      const flushing = sync.flush().then((r) => ((done = true), r));
      await flushMicrotasks();
      expect(done).toBe(false);
      gate.resolve(saved);
      await expect(flushing).resolves.toEqual({ ok: true, unsaved: [] });
    });

    it("retries failed saves immediately instead of waiting for their back-off timer", async () => {
      const send = vi.fn<Send>().mockResolvedValueOnce({ kind: "retry", error: "x" }).mockResolvedValue(saved);
      const { sync } = setup(send);
      sync.setAnswer("q1", "q1-a");
      await flushMicrotasks();
      expect(sync.getStatus("q1")).toBe("failed");
      await expect(sync.flush()).resolves.toEqual({ ok: true, unsaved: [] }); // no timer advance needed
    });

    it("reports exactly what could not be saved instead of hanging", async () => {
      const { sync } = setup(async () => ({ kind: "retry", error: "offline" }));
      sync.setAnswer("q1", "q1-a");
      sync.setAnswer("q2", "q2-a");
      const result = await sync.flush({ timeoutMs: 5_000, rounds: 2 });
      expect(result.ok).toBe(false);
      expect(result.unsaved.sort()).toEqual(["q1", "q2"]);
    });

    it("gives up at its timeout when the network hangs", async () => {
      const { sync } = setup(() => new Promise<SaveOutcome>(() => undefined));
      sync.setAnswer("q1", "q1-a");
      const flushing = sync.flush({ timeoutMs: 3_000 });
      await vi.advanceTimersByTimeAsync(3_000);
      await expect(flushing).resolves.toEqual({ ok: false, unsaved: ["q1"] });
    });
  });

  it("stops everything and notifies when the attempt is closed", async () => {
    const send = vi.fn<Send>(async () => ({ kind: "closed" }));
    const { sync, onClosed } = setup(send);
    sync.setAnswer("q1", "q1-a");
    await flushMicrotasks();
    expect(onClosed).toHaveBeenCalledTimes(1);
    expect(sync.isClosed).toBe(true);
    sync.setAnswer("q1", "q1-b");
    await flushMicrotasks();
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("dispose cancels pending retries", async () => {
    const send = vi.fn<Send>(async () => ({ kind: "retry", error: "x" }));
    const { sync } = setup(send);
    sync.setAnswer("q1", "q1-a");
    await flushMicrotasks();
    sync.dispose();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(send).toHaveBeenCalledTimes(1);
  });
});
