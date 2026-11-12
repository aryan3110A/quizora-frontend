import { afterEach, describe, expect, it, vi } from "vitest";
import { api, ApiError, NETWORK_ERROR_CODE } from "@/lib/api";
import { isTransientError, toSaveOutcome } from "@/lib/exam/examApi";
import { closedError, networkError, serverError, staleError } from "./helpers/fakeExamApi";

describe("toSaveOutcome (what the autosave does after a failed request)", () => {
  it("retries network and server problems", () => {
    expect(toSaveOutcome(networkError()).kind).toBe("retry");
    expect(toSaveOutcome(serverError()).kind).toBe("retry");
    expect(toSaveOutcome(new ApiError("slow down", 429, "RATE_LIMITED")).kind).toBe("retry");
    expect(toSaveOutcome(new ApiError("csrf", 403, "CSRF_INVALID")).kind).toBe("retry");
    expect(toSaveOutcome(new Error("anything unexpected")).kind).toBe("retry");
  });

  it("reads the server's stored answer from a stale-answer rejection", () => {
    expect(toSaveOutcome(staleError("opt-1", 42))).toEqual({ kind: "superseded", current: { selectedOptionId: "opt-1", seq: 42 } });
    expect(toSaveOutcome(new ApiError("stale", 409, "STALE_ANSWER"))).toEqual({ kind: "superseded", current: { selectedOptionId: null, seq: null } });
  });

  it("recognises a closed attempt", () => {
    expect(toSaveOutcome(closedError())).toEqual({ kind: "closed" });
  });

  it("does not hammer the server with a request it rejected as invalid", () => {
    expect(toSaveOutcome(new ApiError("bad option", 400, "INVALID_OPTION")).kind).toBe("fatal");
    expect(toSaveOutcome(new ApiError("not found", 404, "QUESTION_NOT_FOUND")).kind).toBe("fatal");
    expect(isTransientError(new ApiError("forbidden", 403, "FORBIDDEN"))).toBe(false);
  });
});

describe("api() client", () => {
  afterEach(() => vi.unstubAllGlobals());
  const response = (status: number, body: unknown, headers: Record<string, string> = {}) =>
    ({ ok: status < 400, status, headers: { get: (k: string) => headers[k.toLowerCase()] ?? null }, json: async () => body }) as unknown as Response;

  it("turns a failed fetch (offline) into a NETWORK_ERROR ApiError with status 0", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    await expect(api("/student/dashboard")).rejects.toMatchObject({ status: 0, code: NETWORK_ERROR_CODE });
  });

  it("keeps the response body on API errors so callers can read details such as the stored answer", async () => {
    const body = { error: { code: "STALE_ANSWER", message: "newer exists" }, current: { selectedOptionId: "x", seq: 9 } };
    vi.stubGlobal("fetch", vi.fn(async (url: string) => (String(url).endsWith("/health") ? response(200, {}, { "x-csrf-token": "t" }) : response(409, body))));
    const error = await api("/student/attempts/a/answers/q", { method: "PUT", body: "{}" }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 409, code: "STALE_ANSWER", body });
  });

  it("returns the parsed body on success", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response(200, { hello: "world" })));
    await expect(api("/x")).resolves.toEqual({ hello: "world" });
  });
});
