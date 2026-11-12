import { ApiError, NETWORK_ERROR_CODE } from "@/lib/api";
import { AnswerSync, defaultScheduler, type PendingStore, type SaveOutcome, type SaveStatus, type Scheduler, type TimerHandle } from "./answerSync";
import { isTransientError, toSaveOutcome, type AttemptPayload, type ExamApi } from "./examApi";
import { ServerClock } from "./serverClock";

/**
 * Owns one student's exam attempt in the browser: loading/resuming it, the server-authoritative countdown, answer autosave,
 * periodic status checks and (single-flight, idempotent) submission. The page only renders its snapshot.
 *
 * The SERVER stays the source of truth:
 *   - the countdown follows the server's clock (ServerClock), re-synchronised on every response and by a status poll;
 *   - when the server says the attempt is expired/finalized, the controller acts on that even if its own clock disagrees;
 *   - submission is idempotent on the server, so manual + automatic + multi-tab submissions converge on one result.
 */

export type ExamPhase = "loading" | "active" | "submitted" | "ended" | "unauthenticated" | "error";
export type SubmitMode = "manual" | "auto";
export type SubmitResult = "submitted" | "blocked" | "failed" | "done";

export type ExamSnapshot = {
  phase: ExamPhase;
  /** Why the attempt could not be loaded / has ended. */
  error: string;
  attempt: AttemptPayload | null;
  /** Current selection per question (includes choices still being saved). */
  answers: Record<string, string>;
  saveStatus: Record<string, SaveStatus>;
  pendingCount: number;
  failedCount: number;
  lastSaveError: string;
  /** The last request failed because the network is unreachable. */
  offline: boolean;
  remainingSeconds: number;
  /** The deadline has been reached; the answers are being submitted automatically. */
  timeUp: boolean;
  submitting: boolean;
  submitMode: SubmitMode | null;
  submitError: string;
  /** A manual submit was held back because some answers are not saved yet; the UI offers "Submit anyway". */
  submitBlocked: boolean;
  /** Set once the attempt is over; the page navigates there. */
  redirectTo: string | null;
};

export function initialExamSnapshot(): ExamSnapshot {
  return {
    phase: "loading",
    error: "",
    attempt: null,
    answers: {},
    saveStatus: {},
    pendingCount: 0,
    failedCount: 0,
    lastSaveError: "",
    offline: false,
    remainingSeconds: 0,
    timeUp: false,
    submitting: false,
    submitMode: null,
    submitError: "",
    submitBlocked: false,
    redirectTo: null
  };
}

export type ExamControllerOptions = {
  quizId: string;
  api: ExamApi;
  /** Creates the store for unacknowledged answers (localStorage in the browser). Called on the client only. */
  createStore?: (attemptId: string) => PendingStore;
  /** Monotonic milliseconds (default performance.now). */
  mono?: () => number;
  /** Wall clock epoch milliseconds (default Date.now). */
  wallNow?: () => number;
  scheduler?: Scheduler;
  tickMs?: number;
  statusPollMs?: number;
};

const MANUAL_SUBMIT_ATTEMPTS = 3;
const AUTO_SUBMIT_RETRY_MS = 3_000;
const SUBMIT_BACKOFF_MS = [1_000, 2_000, 4_000];

function isNetworkError(error: unknown): boolean {
  return error instanceof ApiError && (error.code === NETWORK_ERROR_CODE || error.status === 0);
}

export class ExamController {
  private snap: ExamSnapshot = initialExamSnapshot();
  private readonly listeners = new Set<() => void>();
  private readonly clock: ServerClock;
  private readonly mono: () => number;
  private readonly wallNow: () => number;
  private readonly scheduler: Scheduler;
  private readonly tickMs: number;
  private readonly statusPollMs: number;

  private generation = 0;
  private started = false;
  private sync: AnswerSync | null = null;
  private store: PendingStore | null = null;
  private attempt: AttemptPayload | null = null;
  private deadlineMs = 0;
  private tickHandle: TimerHandle | null = null;
  private pollHandle: TimerHandle | null = null;
  private autoSubmitStarted = false;
  /** The server told us the attempt is over; overrides whatever the local countdown says. */
  private serverExpired = false;
  private submitPromise: Promise<SubmitResult> | null = null;

  constructor(private readonly options: ExamControllerOptions) {
    this.mono = options.mono ?? (() => performance.now());
    this.wallNow = options.wallNow ?? Date.now;
    this.scheduler = options.scheduler ?? defaultScheduler;
    this.tickMs = options.tickMs ?? 250;
    this.statusPollMs = options.statusPollMs ?? 30_000;
    this.clock = new ServerClock(this.mono);
  }

  // ---- external-store interface (useSyncExternalStore) ----------------------------------------------------------------

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getSnapshot = (): ExamSnapshot => this.snap;

  private patch(partial: Partial<ExamSnapshot>): void {
    this.snap = { ...this.snap, ...partial };
    for (const listener of [...this.listeners]) listener();
  }

  // ---- lifecycle ------------------------------------------------------------------------------------------------------

  /** Loads (or resumes) the attempt. Safe to call again after stop(), e.g. React Strict Mode's mount/unmount/mount. */
  async start(): Promise<void> {
    if (this.started) return;
    this.started = true;
    const generation = ++this.generation;
    this.autoSubmitStarted = false;
    this.serverExpired = false;
    this.submitPromise = null;
    this.patch(initialExamSnapshot());

    const sentAt = this.mono();
    let attempt: AttemptPayload;
    try {
      attempt = await this.options.api.start(this.options.quizId);
    } catch (error) {
      if (generation !== this.generation) return;
      this.failStart(error);
      return;
    }
    if (generation !== this.generation) return;

    const serverTime = Date.parse(attempt.serverTime);
    this.clock.sync(Number.isFinite(serverTime) ? serverTime : this.wallNow(), sentAt, this.mono());
    this.attempt = attempt;
    this.deadlineMs = Date.parse(attempt.deadlineAt);
    this.store = this.options.createStore?.(attempt.id) ?? null;

    const answers: Record<string, string> = {};
    for (const [questionId, optionId] of Object.entries(attempt.answers ?? {})) if (optionId) answers[questionId] = optionId;
    this.snap = { ...this.snap, phase: "active", attempt, answers };

    this.sync = new AnswerSync({
      send: (questionId, optionId, seq) => this.sendAnswer(attempt.id, questionId, optionId, seq),
      store: this.store ?? undefined,
      scheduler: this.scheduler,
      wallNow: this.wallNow,
      onChange: () => this.onSyncChange(),
      onClosed: () => this.onSaveClosed(),
      onRemoteAnswer: (questionId, optionId) => this.onRemoteAnswer(questionId, optionId)
    });
    this.sync.seed(attempt.answerSeqs ?? {});
    // Answers that never reached the server before a refresh/crash (and that the server does not already have newer).
    const restored = this.sync.restore();
    const merged = { ...this.snap.answers };
    for (const [questionId, entry] of Object.entries(restored)) {
      if (entry.selectedOptionId) merged[questionId] = entry.selectedOptionId;
      else delete merged[questionId];
    }
    this.patch({ answers: merged });

    this.tick();
    this.schedulePoll();
  }

  /** Detaches timers and in-flight work (unmount). Unsaved answers stay in the pending store for the next start(). */
  stop(): void {
    this.generation++;
    this.started = false;
    this.clearTimers();
    this.sync?.dispose();
    this.sync = null;
  }

  /** Reload after a failed start ("Try again"). */
  restart(): Promise<void> {
    this.stop();
    return this.start();
  }

  private clearTimers(): void {
    if (this.tickHandle !== null) this.scheduler.clearTimeout(this.tickHandle);
    if (this.pollHandle !== null) this.scheduler.clearTimeout(this.pollHandle);
    this.tickHandle = null;
    this.pollHandle = null;
  }

  private failStart(error: unknown): void {
    if (error instanceof ApiError) {
      if (error.status === 401) return this.goUnauthenticated();
      if (error.status === 409 && (error.code === "ATTEMPT_FINALIZED" || error.code === "ATTEMPT_EXPIRED")) {
        this.patch({ phase: "ended", error: error.message });
        return;
      }
    }
    this.patch({ phase: "error", error: error instanceof Error ? error.message : "Could not start or resume this quiz." });
  }

  private goUnauthenticated(): void {
    this.clearTimers();
    this.sync?.dispose();
    this.patch({ phase: "unauthenticated" });
  }

  // ---- timer ----------------------------------------------------------------------------------------------------------

  private computeRemaining(): number {
    const remainingMs = this.serverExpired ? 0 : this.clock.remainingMs(this.deadlineMs);
    const remainingSeconds = Math.max(0, Math.ceil(remainingMs / 1000));
    const timeUp = remainingMs <= 0;
    if (remainingSeconds !== this.snap.remainingSeconds || timeUp !== this.snap.timeUp) this.patch({ remainingSeconds, timeUp });
    return remainingMs;
  }

  private tick(): void {
    this.tickHandle = null;
    if (this.snap.phase !== "active") return;
    const remainingMs = this.computeRemaining();
    if (remainingMs <= 0 && !this.autoSubmitStarted) {
      this.autoSubmitStarted = true;
      void this.submit("auto");
    }
    if (this.snap.phase === "active") this.tickHandle = this.scheduler.setTimeout(() => this.tick(), this.tickMs);
  }

  private noteServerTime(serverTime: string | undefined, sentAt: number): void {
    if (!serverTime) return;
    const parsed = Date.parse(serverTime);
    if (Number.isFinite(parsed)) this.clock.sync(parsed, sentAt, this.mono());
  }

  // ---- status polling (clock re-sync + "ended elsewhere" detection) --------------------------------------------------

  private schedulePoll(): void {
    if (this.pollHandle !== null) this.scheduler.clearTimeout(this.pollHandle);
    this.pollHandle = this.scheduler.setTimeout(() => {
      this.pollHandle = null;
      void this.pollStatus().finally(() => {
        if (this.snap.phase === "active") this.schedulePoll();
      });
    }, this.statusPollMs);
  }

  /** Asks the server for the attempt's state and re-aligns the countdown with its clock. */
  async pollStatus(): Promise<void> {
    const attempt = this.attempt;
    if (!attempt || this.snap.phase !== "active") return;
    const generation = this.generation;
    const sentAt = this.mono();
    try {
      const status = await this.options.api.status(attempt.id);
      if (generation !== this.generation || this.snap.phase !== "active") return;
      this.noteServerTime(status.serverTime, sentAt);
      this.setOffline(false);
      if (status.expired) this.serverExpired = true; // the SERVER says time is up, whatever the local clock thinks
      this.computeRemaining();
      if (status.finalized) {
        this.finish(); // submitted in another tab, or finalized by the server worker
      } else if (status.expired && !this.autoSubmitStarted) {
        this.autoSubmitStarted = true;
        void this.submit("auto");
      }
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) this.goUnauthenticated();
      else if (isNetworkError(error)) this.setOffline(true);
    }
  }

  /** Browser events: back online / tab visible again (after sleep) -> retry saves now and re-sync the clock. */
  onOnline(): void {
    this.sync?.retryNow();
    void this.pollStatus();
  }

  onOffline(): void {
    this.setOffline(true);
  }

  onVisible(): void {
    void this.pollStatus();
  }

  private setOffline(offline: boolean): void {
    if (this.snap.offline !== offline) this.patch({ offline });
  }

  // ---- answers --------------------------------------------------------------------------------------------------------

  /** The student picked an option (or `null` to clear). */
  choose(questionId: string, optionId: string | null): void {
    if (this.snap.phase !== "active" || this.snap.timeUp || this.snap.submitting || !this.sync) return;
    const answers = { ...this.snap.answers };
    if (optionId) answers[questionId] = optionId;
    else delete answers[questionId];
    this.patch({ answers });
    this.sync.setAnswer(questionId, optionId);
  }

  retrySave(questionId?: string): void {
    this.sync?.retryNow(questionId);
  }

  private async sendAnswer(attemptId: string, questionId: string, optionId: string | null, seq: number): Promise<SaveOutcome> {
    const sentAt = this.mono();
    try {
      const response = await this.options.api.saveAnswer(attemptId, questionId, optionId, seq);
      this.noteServerTime(response.serverTime, sentAt);
      this.setOffline(false);
      return { kind: "saved" };
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        this.goUnauthenticated();
        return { kind: "fatal", error: "Please sign in again." };
      }
      if (isNetworkError(error)) this.setOffline(true);
      else if (error instanceof ApiError) this.setOffline(false); // we did reach the server
      return toSaveOutcome(error);
    }
  }

  private onSyncChange(): void {
    const sync = this.sync;
    if (!sync) return;
    this.patch({ saveStatus: sync.statuses(), pendingCount: sync.pendingCount, failedCount: sync.failedCount, lastSaveError: sync.lastError });
  }

  private onRemoteAnswer(questionId: string, optionId: string | null): void {
    const answers = { ...this.snap.answers };
    if (optionId) answers[questionId] = optionId;
    else delete answers[questionId];
    this.patch({ answers });
  }

  /** The server refused a save because the attempt is closed (deadline passed, or submitted elsewhere): finish up. */
  private onSaveClosed(): void {
    this.serverExpired = true;
    this.autoSubmitStarted = true;
    this.computeRemaining();
    void this.submit("auto");
  }

  // ---- submission -----------------------------------------------------------------------------------------------------

  /**
   * Submits the attempt. Single-flight: a manual click, the automatic deadline submit, and a "closed" signal that arrive together
   * share ONE request sequence. The server treats repeated submissions as no-ops, so this is also safe across browser tabs.
   * @param force manual only: submit even though some answers could not be saved
   */
  submit(mode: SubmitMode, options: { force?: boolean } = {}): Promise<SubmitResult> {
    if (this.snap.phase !== "active") return Promise.resolve("done");
    if (!this.submitPromise) {
      this.submitPromise = this.runSubmit(mode, options.force ?? false).finally(() => {
        this.submitPromise = null;
      });
    }
    return this.submitPromise;
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => {
      this.scheduler.setTimeout(resolve, ms);
    });
  }

  private async runSubmit(mode: SubmitMode, force: boolean): Promise<SubmitResult> {
    const attempt = this.attempt;
    const sync = this.sync;
    if (!attempt || !sync) return "done";
    const generation = this.generation;
    this.patch({ submitting: true, submitMode: mode, submitError: "", submitBlocked: false });

    // 1. Everything the student chose must be on the server first.
    const flushed = await sync.flush({ timeoutMs: mode === "auto" ? 4_000 : 15_000, rounds: 2 });
    if (generation !== this.generation) return "done";
    if (!flushed.ok && mode === "manual" && !force && !sync.isClosed) {
      const n = flushed.unsaved.length;
      this.patch({
        submitting: false,
        submitMode: null,
        submitBlocked: true,
        submitError: `${n} ${n === 1 ? "answer has" : "answers have"} not been saved yet. Check your connection and try again, or submit anyway.`
      });
      return "blocked";
    }

    // 2. Submit. Retried on network trouble; the server makes repeats harmless.
    let failures = 0;
    for (;;) {
      try {
        await this.options.api.submit(attempt.id);
        if (generation !== this.generation) return "done";
        return this.finish();
      } catch (error) {
        if (generation !== this.generation) return "done";
        if (error instanceof ApiError && error.status === 401) {
          this.goUnauthenticated();
          return "failed";
        }
        if (error instanceof ApiError && error.code === "ATTEMPT_CLOSED") return this.finish(); // already closed on the server
        if (!isTransientError(error)) {
          this.patch({ submitting: false, submitMode: null, submitError: error instanceof Error ? error.message : "Submission failed." });
          return "failed";
        }
        if (isNetworkError(error)) this.setOffline(true);
        failures += 1;
        if (mode === "manual" && failures >= MANUAL_SUBMIT_ATTEMPTS) {
          this.patch({ submitting: false, submitMode: null, submitError: "Submission failed. Check your connection and try again." });
          return "failed";
        }
        // Manual: short back-off, then give up and let the student retry. Automatic: never give up — time is up.
        await this.delay(mode === "auto" ? AUTO_SUBMIT_RETRY_MS : SUBMIT_BACKOFF_MS[Math.min(failures - 1, SUBMIT_BACKOFF_MS.length - 1)]);
        if (generation !== this.generation) return "done";
      }
    }
  }

  private finish(): SubmitResult {
    if (this.snap.phase === "submitted") return "submitted";
    const attemptId = this.attempt?.id ?? null;
    this.clearTimers();
    this.sync?.dispose();
    try {
      this.store?.save({}); // anything still unacknowledged is moot once the attempt is closed
    } catch {
      /* best effort */
    }
    this.patch({
      phase: "submitted",
      submitting: false,
      submitMode: null,
      submitError: "",
      submitBlocked: false,
      offline: false,
      redirectTo: attemptId ? `/results/${attemptId}` : null
    });
    return "submitted";
  }
}
