/**
 * Reliable answer autosave.
 *
 * Guarantees, per question:
 *   1. At most ONE save request is in flight. Choosing again while one is running keeps only the latest choice (coalescing).
 *   2. Every choice gets a strictly increasing sequence number. The server applies a save only if its sequence is newer than
 *      the stored one, so a request that is delayed in the network can never overwrite a newer answer.
 *   3. A failed save is kept and retried automatically with exponential back-off until it succeeds (manual retry and the
 *      browser's "online" event retry immediately). Nothing is dropped on failure.
 *   4. Unacknowledged answers are mirrored to a PendingStore (localStorage) and restored after a refresh, with their ORIGINAL
 *      sequence numbers, unless the server already holds something newer.
 *   5. flush() lets submission wait until everything is on the server (or report exactly what is not).
 *
 * The network, timers and storage are injected, so this class has no dependency on React or the browser and is unit-tested.
 */

export type SaveStatus = "idle" | "pending" | "saving" | "saved" | "failed";

export type SaveOutcome =
  /** The server has it (applied, or an identical retry). */
  | { kind: "saved" }
  /** The server holds a newer answer than this request carried. `current` is what it holds. */
  | { kind: "superseded"; current: { selectedOptionId: string | null; seq: number | null } }
  /** The attempt no longer accepts answers (deadline passed, or already submitted elsewhere). */
  | { kind: "closed" }
  /** Temporary problem (offline, 5xx, throttled): keep the answer and try again. */
  | { kind: "retry"; error: string }
  /** The server refused the request itself: do not hammer it, wait for the student to retry. */
  | { kind: "fatal"; error: string };

export type PendingEntry = { selectedOptionId: string | null; seq: number };

export interface PendingStore {
  load(): Record<string, PendingEntry>;
  save(entries: Record<string, PendingEntry>): void;
}

export type TimerHandle = unknown;
export type Scheduler = {
  setTimeout(fn: () => void, ms: number): TimerHandle;
  clearTimeout(handle: TimerHandle): void;
};

export const defaultScheduler: Scheduler = {
  setTimeout: (fn, ms) => globalThis.setTimeout(fn, ms),
  clearTimeout: (handle) => globalThis.clearTimeout(handle as ReturnType<typeof setTimeout>)
};

export const DEFAULT_RETRY_DELAYS_MS = [1_000, 2_000, 4_000, 8_000, 15_000];

export type AnswerSyncOptions = {
  send: (questionId: string, selectedOptionId: string | null, seq: number) => Promise<SaveOutcome>;
  store?: PendingStore;
  scheduler?: Scheduler;
  /** Wall clock (epoch ms). Sequence numbers are max(previous + 1, wall clock), which also orders tabs of the same browser. */
  wallNow?: () => number;
  retryDelaysMs?: number[];
  /** Called after every state change. */
  onChange?: () => void;
  /** The attempt stopped accepting answers. */
  onClosed?: () => void;
  /** The server holds a newer answer than ours (for example saved from another tab): adopt it. */
  onRemoteAnswer?: (questionId: string, selectedOptionId: string | null, seq: number | null) => void;
};

type Entry = {
  /** Latest choice the server has not acknowledged yet. */
  desired: PendingEntry | null;
  inflightSeq: number | null;
  /** Highest sequence number the server is known to hold for this question. */
  ackedSeq: number;
  /** Highest sequence number issued locally. */
  lastSeq: number;
  status: SaveStatus;
  failures: number;
  retryHandle: TimerHandle | null;
};

export type FlushResult = { ok: boolean; unsaved: string[] };

export class AnswerSync {
  private readonly entries = new Map<string, Entry>();
  private readonly scheduler: Scheduler;
  private readonly wallNow: () => number;
  private readonly retryDelays: number[];
  private readonly waiters = new Set<() => void>();
  private closed = false;
  private disposed = false;
  lastError = "";

  constructor(private readonly options: AnswerSyncOptions) {
    this.scheduler = options.scheduler ?? defaultScheduler;
    this.wallNow = options.wallNow ?? Date.now;
    this.retryDelays = options.retryDelaysMs?.length ? options.retryDelaysMs : DEFAULT_RETRY_DELAYS_MS;
  }

  private entry(questionId: string): Entry {
    let e = this.entries.get(questionId);
    if (!e) {
      e = { desired: null, inflightSeq: null, ackedSeq: 0, lastSeq: 0, status: "idle", failures: 0, retryHandle: null };
      this.entries.set(questionId, e);
    }
    return e;
  }

  /** Tells the sync which sequence numbers the server already holds (from the attempt payload). */
  seed(serverSeqs: Record<string, number>): void {
    for (const [questionId, seq] of Object.entries(serverSeqs)) {
      const e = this.entry(questionId);
      e.ackedSeq = Math.max(e.ackedSeq, seq);
      e.lastSeq = Math.max(e.lastSeq, seq);
    }
  }

  /**
   * Re-queues answers that were never acknowledged before a refresh/crash. Entries the server already has (or has newer) are
   * discarded. Returns the entries that were restored so the UI can show them as selected.
   */
  restore(): Record<string, PendingEntry> {
    const restored: Record<string, PendingEntry> = {};
    const stored = this.options.store?.load() ?? {};
    for (const [questionId, saved] of Object.entries(stored)) {
      const e = this.entry(questionId);
      if (saved.seq <= e.ackedSeq) continue;
      e.lastSeq = Math.max(e.lastSeq, saved.seq);
      e.desired = { selectedOptionId: saved.selectedOptionId, seq: saved.seq };
      e.status = "pending";
      restored[questionId] = saved;
    }
    this.persist();
    for (const questionId of Object.keys(restored)) this.pump(questionId);
    this.changed();
    return restored;
  }

  /** Record a choice (or `null` to clear) and start saving it. */
  setAnswer(questionId: string, selectedOptionId: string | null): void {
    if (this.closed || this.disposed) return;
    const e = this.entry(questionId);
    const seq = Math.max(e.lastSeq + 1, this.wallNow());
    e.lastSeq = seq;
    e.desired = { selectedOptionId, seq };
    e.failures = 0;
    this.clearRetry(e);
    e.status = e.inflightSeq === null ? "pending" : "saving";
    this.persist();
    this.changed();
    this.pump(questionId);
  }

  getStatus(questionId: string): SaveStatus {
    return this.entries.get(questionId)?.status ?? "idle";
  }

  statuses(): Record<string, SaveStatus> {
    const out: Record<string, SaveStatus> = {};
    for (const [questionId, e] of this.entries) if (e.status !== "idle") out[questionId] = e.status;
    return out;
  }

  /** Questions whose latest choice is not on the server yet. */
  unsavedQuestions(): string[] {
    return [...this.entries].filter(([, e]) => e.desired !== null || e.inflightSeq !== null).map(([id]) => id);
  }

  get pendingCount(): number {
    return [...this.entries.values()].filter((e) => e.status === "pending" || e.status === "saving").length;
  }

  get failedCount(): number {
    return [...this.entries.values()].filter((e) => e.status === "failed").length;
  }

  get isClosed(): boolean {
    return this.closed;
  }

  /** Retry failed saves right now (manual "Retry", or the browser came back online). */
  retryNow(questionId?: string): void {
    if (this.closed || this.disposed) return;
    const ids = questionId ? [questionId] : [...this.entries.keys()];
    for (const id of ids) {
      const e = this.entries.get(id);
      if (!e || e.desired === null) continue;
      this.clearRetry(e);
      this.pump(id);
    }
  }

  /**
   * Resolves when every answer has reached the server, or reports which ones did not. Failed saves are retried immediately
   * (`rounds` times) instead of waiting for their back-off timer.
   */
  async flush(options: { timeoutMs?: number; rounds?: number } = {}): Promise<FlushResult> {
    const timeoutMs = options.timeoutMs ?? 10_000;
    const rounds = options.rounds ?? 2;
    let timedOut = false;
    const timer = this.scheduler.setTimeout(() => {
      timedOut = true;
      this.wake();
    }, timeoutMs);
    try {
      for (let round = 0; round < rounds && !timedOut && !this.closed && !this.disposed; round++) {
        this.retryNow();
        await this.untilSettled(() => timedOut);
        if (this.unsavedQuestions().length === 0) break;
      }
    } finally {
      this.scheduler.clearTimeout(timer);
    }
    const unsaved = this.unsavedQuestions();
    return { ok: unsaved.length === 0, unsaved };
  }

  dispose(): void {
    this.disposed = true;
    for (const e of this.entries.values()) this.clearRetry(e);
    this.wake();
  }

  // ---- internals -----------------------------------------------------------------------------------------------------

  private pump(questionId: string): void {
    if (this.closed || this.disposed) return;
    const e = this.entry(questionId);
    if (e.inflightSeq !== null) return; // never two overlapping saves for one question
    const desired = e.desired;
    if (!desired) return;
    if (desired.seq <= e.ackedSeq) {
      e.desired = null;
      e.status = "saved";
      this.persist();
      this.changed();
      return;
    }
    e.inflightSeq = desired.seq;
    e.status = "saving";
    this.changed();
    this.options
      .send(questionId, desired.selectedOptionId, desired.seq)
      .then(
        (outcome) => outcome,
        (error: unknown): SaveOutcome => ({ kind: "retry", error: error instanceof Error ? error.message : String(error) })
      )
      .then((outcome) => this.handleOutcome(questionId, desired, outcome));
  }

  private handleOutcome(questionId: string, sent: PendingEntry, outcome: SaveOutcome): void {
    const e = this.entry(questionId);
    e.inflightSeq = null;
    if (this.disposed) {
      this.wake();
      return;
    }
    switch (outcome.kind) {
      case "saved": {
        e.ackedSeq = Math.max(e.ackedSeq, sent.seq);
        e.failures = 0;
        this.lastError = "";
        if (e.desired && e.desired.seq > sent.seq) {
          e.status = "pending"; // the student chose again meanwhile: send the latest
          this.changed();
          this.pump(questionId);
          return;
        }
        e.desired = null;
        e.status = "saved";
        break;
      }
      case "superseded": {
        const serverSeq = outcome.current.seq ?? sent.seq;
        e.ackedSeq = Math.max(e.ackedSeq, serverSeq);
        e.lastSeq = Math.max(e.lastSeq, serverSeq);
        e.failures = 0;
        if (e.desired && e.desired.seq > serverSeq) {
          e.status = "pending"; // our newest choice is still newer than the server's: send it
          this.changed();
          this.pump(questionId);
          return;
        }
        // The server holds something newer than anything we want to say (another tab/device): adopt it.
        e.desired = null;
        e.status = "saved";
        this.options.onRemoteAnswer?.(questionId, outcome.current.selectedOptionId, outcome.current.seq);
        break;
      }
      case "closed": {
        this.closed = true;
        for (const other of this.entries.values()) this.clearRetry(other);
        this.persist();
        this.changed();
        this.options.onClosed?.();
        return;
      }
      case "retry": {
        e.failures += 1;
        e.status = "failed";
        this.lastError = outcome.error;
        const delay = this.retryDelays[Math.min(e.failures - 1, this.retryDelays.length - 1)];
        this.clearRetry(e);
        e.retryHandle = this.scheduler.setTimeout(() => {
          e.retryHandle = null;
          this.pump(questionId);
        }, delay);
        break;
      }
      case "fatal": {
        e.failures += 1;
        e.status = "failed";
        this.lastError = outcome.error; // no timer: only a manual retry tries again
        break;
      }
    }
    this.persist();
    this.changed();
  }

  private clearRetry(e: Entry): void {
    if (e.retryHandle !== null) {
      this.scheduler.clearTimeout(e.retryHandle);
      e.retryHandle = null;
    }
  }

  private persist(): void {
    const pending: Record<string, PendingEntry> = {};
    for (const [questionId, e] of this.entries) if (e.desired) pending[questionId] = e.desired;
    try {
      this.options.store?.save(pending);
    } catch {
      /* persistence is best-effort */
    }
  }

  private changed(): void {
    this.options.onChange?.();
    this.wake();
  }

  private wake(): void {
    for (const waiter of [...this.waiters]) waiter();
  }

  private isSettled(): boolean {
    return [...this.entries.values()].every((e) => e.status !== "pending" && e.status !== "saving");
  }

  private untilSettled(abort: () => boolean): Promise<void> {
    return new Promise((resolve) => {
      const check = () => {
        if (abort() || this.closed || this.disposed || this.isSettled()) {
          this.waiters.delete(check);
          resolve();
        }
      };
      this.waiters.add(check);
      check();
    });
  }
}
