import { api, ApiError, NETWORK_ERROR_CODE } from "@/lib/api";
import type { SaveOutcome } from "./answerSync";

export type ExamQuestion = {
  id: string;
  text: string;
  type: "SINGLE_SELECT";
  position: number;
  marks: number;
  options: Array<{ id: string; text: string; position: number }>;
};

export type AttemptPayload = {
  id: string;
  title: string;
  deadlineAt: string;
  /** The server's (database) clock when it produced this response. */
  serverTime: string;
  questions: ExamQuestion[];
  answers: Record<string, string | null>;
  /** Sequence numbers of the answers the server holds. Absent when talking to an older backend. */
  answerSeqs?: Record<string, number>;
};

export type StatusPayload = {
  status: string;
  finalized: boolean;
  /** The server says the attempt no longer accepts answers. */
  expired: boolean;
  deadlineAt: string;
  serverTime: string;
};

export type SavePayload = { serverTime?: string; applied?: boolean };

/** The few calls the exam page makes. Injected so the logic can be tested without a network. */
export type ExamApi = {
  start(quizId: string): Promise<AttemptPayload>;
  saveAnswer(attemptId: string, questionId: string, selectedOptionId: string | null, seq: number): Promise<SavePayload>;
  submit(attemptId: string): Promise<void>;
  status(attemptId: string): Promise<StatusPayload>;
};

export const httpExamApi: ExamApi = {
  start: (quizId) => api<AttemptPayload>(`/student/quizzes/${quizId}/attempts`, { method: "POST", body: JSON.stringify({}) }),
  saveAnswer: (attemptId, questionId, selectedOptionId, seq) =>
    api<SavePayload>(`/student/attempts/${attemptId}/answers/${questionId}`, {
      method: "PUT",
      body: JSON.stringify({ selectedOptionId, seq })
    }),
  submit: async (attemptId) => {
    await api(`/student/attempts/${attemptId}/submit`, { method: "POST", body: JSON.stringify({}) });
  },
  status: (attemptId) => api<StatusPayload>(`/student/attempts/${attemptId}/status`)
};

/** True when the request is worth repeating unchanged: offline, server trouble, throttling, or an expired CSRF token. */
export function isTransientError(error: unknown): boolean {
  if (!(error instanceof ApiError)) return true; // unexpected: do not lose the student's data over it
  if (error.code === NETWORK_ERROR_CODE || error.status === 0) return true;
  if (error.status >= 500 || error.status === 429 || error.status === 408) return true;
  if (error.status === 403 && error.code?.startsWith("CSRF")) return true; // api() picks up the fresh token for the retry
  return false;
}

/** Maps the failure of a save request to what the autosave queue should do next. */
export function toSaveOutcome(error: unknown): SaveOutcome {
  if (error instanceof ApiError) {
    if (error.code === "STALE_ANSWER") {
      const current = (error.body as { current?: { selectedOptionId?: string | null; seq?: number | null } } | undefined)?.current;
      return { kind: "superseded", current: { selectedOptionId: current?.selectedOptionId ?? null, seq: current?.seq ?? null } };
    }
    if (error.code === "ATTEMPT_CLOSED") return { kind: "closed" };
  }
  const message = error instanceof Error ? error.message : "Answer could not be saved.";
  return isTransientError(error) ? { kind: "retry", error: message } : { kind: "fatal", error: message };
}
