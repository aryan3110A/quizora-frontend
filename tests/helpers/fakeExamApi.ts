import { ApiError, NETWORK_ERROR_CODE } from "@/lib/api";
import type { AttemptPayload, ExamApi, SavePayload, StatusPayload } from "@/lib/exam/examApi";

export const networkError = () => new ApiError("Network problem", 0, NETWORK_ERROR_CODE);
export const serverError = () => new ApiError("Server error", 503, "UNAVAILABLE");
export const closedError = () => new ApiError("This attempt is closed.", 409, "ATTEMPT_CLOSED");
export const staleError = (selectedOptionId: string | null, seq: number | null) =>
  new ApiError("A newer answer for this question was already saved.", 409, "STALE_ANSWER", { current: { selectedOptionId, seq } });

export type Deferred<T> = { promise: Promise<T>; resolve: (value: T) => void; reject: (error: unknown) => void };
export function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

export function attemptPayload(opts: {
  serverTimeMs: number;
  deadlineInMs?: number;
  answers?: Record<string, string | null>;
  answerSeqs?: Record<string, number>;
  id?: string;
}): AttemptPayload {
  return {
    id: opts.id ?? "attempt-1",
    title: "Test quiz",
    serverTime: new Date(opts.serverTimeMs).toISOString(),
    deadlineAt: new Date(opts.serverTimeMs + (opts.deadlineInMs ?? 60_000)).toISOString(),
    questions: ["q1", "q2", "q3"].map((id, position) => ({
      id,
      text: `Question ${id}`,
      type: "SINGLE_SELECT" as const,
      position,
      marks: 1,
      options: ["a", "b", "c", "d"].map((o, i) => ({ id: `${id}-${o}`, text: o, position: i }))
    })),
    answers: opts.answers ?? {},
    answerSeqs: opts.answerSeqs
  };
}

/**
 * A scriptable ExamApi. Each method records its calls and delegates to a replaceable handler, so a test can make any single
 * request succeed, fail, hang (deferred) or answer out of order.
 */
export class FakeExamApi implements ExamApi {
  calls: Array<{ method: string; args: unknown[] }> = [];
  onStart: (quizId: string) => Promise<AttemptPayload> | AttemptPayload = () => {
    throw new Error("onStart not scripted");
  };
  onSave: (attemptId: string, questionId: string, option: string | null, seq: number) => Promise<SavePayload> | SavePayload = () => ({});
  onSubmit: (attemptId: string) => Promise<void> | void = () => undefined;
  onStatus: (attemptId: string) => Promise<StatusPayload> | StatusPayload = () => {
    throw new Error("onStatus not scripted");
  };

  count = (method: string) => this.calls.filter((c) => c.method === method).length;
  saves = () => this.calls.filter((c) => c.method === "saveAnswer").map((c) => ({ questionId: c.args[1] as string, option: c.args[2] as string | null, seq: c.args[3] as number }));

  async start(quizId: string) {
    this.calls.push({ method: "start", args: [quizId] });
    return this.onStart(quizId);
  }
  async saveAnswer(attemptId: string, questionId: string, selectedOptionId: string | null, seq: number) {
    this.calls.push({ method: "saveAnswer", args: [attemptId, questionId, selectedOptionId, seq] });
    return this.onSave(attemptId, questionId, selectedOptionId, seq);
  }
  async submit(attemptId: string) {
    this.calls.push({ method: "submit", args: [attemptId] });
    await this.onSubmit(attemptId);
  }
  async status(attemptId: string) {
    this.calls.push({ method: "status", args: [attemptId] });
    return this.onStatus(attemptId);
  }
}
