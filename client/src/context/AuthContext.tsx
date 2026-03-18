/**
 * AuthContext.tsx — Phase 19: Frontend Authentication State
 *
 * Manages JWT token persistence, user state, and login/logout flows.
 * Token stored in React state (localStorage blocked in sandbox iframe).
 * Provides ProtectedRoute wrapper for wouter that redirects to /#/login.
 */

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
} from "react";
import { Redirect } from "wouter";
import { setAuthToken } from "@/lib/queryClient";
import { queryClient } from "@/lib/queryClient";
import type { AuthUser } from "@/lib/api";

/** Resolve API base URL (same logic as queryClient.ts) */
function getApiBase(): string {
  if (typeof window !== "undefined" && window.location.hostname === "swarme.io") {
    return "https://api.swarme.io";
  }
  return "";
}

// ─────────────────────────────────────────────────────────────
// Context shape
// ─────────────────────────────────────────────────────────────

interface AuthContextValue {
  /** Current authenticated user, or null if logged out */
  user: AuthUser | null;
  /** JWT token string, or null */
  token: string | null;
  /** Whether auth state is still being resolved */
  isLoading: boolean;
  /** Store token + user after successful login/register */
  login: (token: string, user: AuthUser) => void;
  /** Clear auth state and redirect to login */
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  token: null,
  isLoading: true,
  login: () => {},
  logout: () => {},
});

// ─────────────────────────────────────────────────────────────
// Provider
// ─────────────────────────────────────────────────────────────

/**
 * Persist auth to localStorage so sessions survive page reloads
 * and browser back/forward navigation.
 * Falls back to in-memory storage if localStorage is blocked (e.g. sandboxed iframes).
 */
function safeGetStorage(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSetStorage(key: string, value: string | null) {
  try {
    if (value === null) {
      localStorage.removeItem(key);
    } else {
      localStorage.setItem(key, value);
    }
  } catch {
    // localStorage blocked — session will be in-memory only
  }
}

const STORAGE_TOKEN_KEY = "swarme_auth_token";
const STORAGE_USER_KEY = "swarme_auth_user";

function loadPersistedToken(): string | null {
  return safeGetStorage(STORAGE_TOKEN_KEY);
}

function loadPersistedUser(): AuthUser | null {
  const raw = safeGetStorage(STORAGE_USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AuthUser;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(loadPersistedUser);
  const [token, setToken] = useState<string | null>(loadPersistedToken);
  const [isLoading, setIsLoading] = useState(() => {
    // If we have a persisted token, validate it on mount
    return !!loadPersistedToken();
  });

  // On mount: if we have a persisted token, validate it against the server
  useEffect(() => {
    const savedToken = loadPersistedToken();
    if (!savedToken) {
      setIsLoading(false);
      return;
    }
    // Set token for API calls immediately
    setAuthToken(savedToken);
    // Validate by calling /api/auth/me
    fetch(`${getApiBase()}/api/auth/me`, {
      headers: { Authorization: `Bearer ${savedToken}` },
    })
      .then((res) => {
        if (res.ok) return res.json();
        throw new Error("Invalid token");
      })
      .then((data: { success: boolean; user: AuthUser }) => {
        if (data.success && data.user) {
          setUser(data.user);
          setToken(savedToken);
          safeSetStorage(STORAGE_USER_KEY, JSON.stringify(data.user));
        } else {
          throw new Error("Invalid session");
        }
      })
      .catch(() => {
        // Token expired or invalid — clear everything
        setToken(null);
        setUser(null);
        setAuthToken(null);
        safeSetStorage(STORAGE_TOKEN_KEY, null);
        safeSetStorage(STORAGE_USER_KEY, null);
      })
      .finally(() => setIsLoading(false));
  }, []);

  // Sync token to apiRequest layer whenever it changes
  useEffect(() => {
    setAuthToken(token);
  }, [token]);

  const login = useCallback((newToken: string, newUser: AuthUser) => {
    setToken(newToken);
    setUser(newUser);
    setAuthToken(newToken);
    safeSetStorage(STORAGE_TOKEN_KEY, newToken);
    safeSetStorage(STORAGE_USER_KEY, JSON.stringify(newUser));
  }, []);

  const logout = useCallback(() => {
    setToken(null);
    setUser(null);
    setAuthToken(null);
    safeSetStorage(STORAGE_TOKEN_KEY, null);
    safeSetStorage(STORAGE_USER_KEY, null);
    // Clear all cached queries on logout
    queryClient.clear();
  }, []);

  return (
    <AuthContext.Provider value={{ user, token, isLoading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

// ─────────────────────────────────────────────────────────────
// Hooks
// ─────────────────────────────────────────────────────────────

export function useAuth() {
  return useContext(AuthContext);
}

// ─────────────────────────────────────────────────────────────
// ProtectedRoute wrapper
// ─────────────────────────────────────────────────────────────

/**
 * Wraps a component so it only renders if authenticated.
 * Otherwise, redirects to /#/login.
 *
 * Usage: <ProtectedRoute><SomeComponent /></ProtectedRoute>
 */
export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!user) {
    return <Redirect to="/login" />;
  }

  return <>{children}</>;
}
