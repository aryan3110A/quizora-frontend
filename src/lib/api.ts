const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000/api/v1";

export class ApiError extends Error {
  status: number;
  code?: string;
  constructor(message: string, status: number, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

let csrfToken: string | undefined;

function getCsrfFromCookie(): string | undefined {
  if (typeof document === "undefined") return undefined;
  const match = document.cookie.match(/(?:^|;\s*)quizora_csrf=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : undefined;
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const method = (init.method ?? "GET").toUpperCase();
  const headers = new Headers(init.headers);

  if (!(init.body instanceof FormData) && init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  // Ensure CSRF token is attached for state-changing requests
  if (!["GET", "HEAD", "OPTIONS"].includes(method)) {
    let token = csrfToken || getCsrfFromCookie();
    if (!token) {
      // Fetch health endpoint to trigger CSRF cookie / header generation
      try {
        const ping = await fetch(`${API_BASE}/health`, { credentials: "include", cache: "no-store" });
        const pingToken = ping.headers.get("x-csrf-token");
        if (pingToken) {
          csrfToken = pingToken;
          token = pingToken;
        } else {
          token = getCsrfFromCookie();
        }
      } catch {
        // Fallback to cookie
        token = getCsrfFromCookie();
      }
    }
    if (token) {
      headers.set("x-csrf-token", token);
    }
  }

  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers,
    credentials: "include",
    cache: "no-store"
  });

  const newToken = response.headers.get("x-csrf-token");
  if (newToken) {
    csrfToken = newToken;
  }

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new ApiError(body?.error?.message ?? "Request failed", response.status, body?.error?.code);
  }

  return body as T;
}
