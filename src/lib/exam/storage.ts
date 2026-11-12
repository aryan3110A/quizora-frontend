import type { PendingEntry, PendingStore } from "./answerSync";

/**
 * Keeps answers that have NOT been acknowledged by the server in the browser, so that a refresh, a crash or a closed tab while
 * offline does not lose them. Entries are removed as soon as the server has them. Every storage access is guarded: private
 * windows and blocked storage must degrade to "no persistence", never to an error in the exam page.
 */
export function localStoragePendingStore(attemptId: string): PendingStore {
  const key = `quizora:pending-answers:${attemptId}`;
  return {
    load() {
      try {
        const raw = window.localStorage.getItem(key);
        if (!raw) return {};
        const parsed: unknown = JSON.parse(raw);
        if (!parsed || typeof parsed !== "object") return {};
        const entries: Record<string, PendingEntry> = {};
        for (const [questionId, value] of Object.entries(parsed as Record<string, unknown>)) {
          const entry = value as Partial<PendingEntry> | null;
          if (entry && Number.isSafeInteger(entry.seq) && (typeof entry.selectedOptionId === "string" || entry.selectedOptionId === null)) {
            entries[questionId] = { selectedOptionId: entry.selectedOptionId, seq: entry.seq as number };
          }
        }
        return entries;
      } catch {
        return {};
      }
    },
    save(entries) {
      try {
        if (Object.keys(entries).length === 0) window.localStorage.removeItem(key);
        else window.localStorage.setItem(key, JSON.stringify(entries));
      } catch {
        /* storage unavailable or full: continue without persistence */
      }
    }
  };
}

/** In-memory store, used when nothing better is available and in tests. */
export function memoryPendingStore(initial: Record<string, PendingEntry> = {}): PendingStore & { snapshot(): Record<string, PendingEntry> } {
  let entries: Record<string, PendingEntry> = { ...initial };
  return {
    load: () => ({ ...entries }),
    save: (next) => {
      entries = { ...next };
    },
    snapshot: () => ({ ...entries })
  };
}
