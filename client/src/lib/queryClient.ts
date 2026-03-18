import { QueryClient, QueryFunction } from "@tanstack/react-query";

/**
 * API_BASE resolves in three contexts:
 *   1. Local dev (Vite proxy)        -> ""  (relative URLs, same port)
 *   2. deploy_website (S3/iframe)    -> "__PORT_5000__" gets replaced at deploy time
 *   3. Cloudflare Pages (swarme.io)  -> "https://api.swarme.io" (cross-origin)
 */
const API_BASE = "__PORT_5000__".startsWith("__")
  ? (typeof window !== "undefined" && window.location.hostname === "swarme.io"
    ? "https://api.swarme.io"
    : "")
  : "__PORT_5000__";

// ─── Auth Token Injection ────────────────────────────────
// The AuthProvider calls setAuthToken() when token changes.
// All apiRequest + default queryFn calls inject it as Bearer header.
let _authToken: string | null = null;

export function setAuthToken(token: string | null) {
  _authToken = token;
}

export function getAuthToken(): string | null {
  return _authToken;
}

function authHeaders(extra?: Record<string, string>): Record<string, string> {
  const h: Record<string, string> = { ...extra };
  if (_authToken) {
    h["Authorization"] = `Bearer ${_authToken}`;
  }
  return h;
}

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<Response> {
  const headers = authHeaders(data ? { "Content-Type": "application/json" } : {});
  const res = await fetch(`${API_BASE}${url}`, {
    method,
    headers,
    body: data ? JSON.stringify(data) : undefined,
  });

  await throwIfResNotOk(res);
  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const res = await fetch(`${API_BASE}${queryKey.join("/")}`, {
      headers: authHeaders(),
    });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});
