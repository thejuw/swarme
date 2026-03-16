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
 * In-memory token store for the session.
 * We can't use localStorage (sandbox blocks it), so we keep
 * a module-level ref that survives re-renders but not full page reloads.
 */
let _storedToken: string | null = null;
let _storedUser: AuthUser | null = null;

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(_storedUser);
  const [token, setToken] = useState<string | null>(_storedToken);
  const [isLoading, setIsLoading] = useState(false);

  // Sync token to apiRequest layer whenever it changes
  useEffect(() => {
    setAuthToken(token);
    _storedToken = token;
    _storedUser = user;
  }, [token, user]);

  const login = useCallback((newToken: string, newUser: AuthUser) => {
    setToken(newToken);
    setUser(newUser);
    setAuthToken(newToken);
    _storedToken = newToken;
    _storedUser = newUser;
  }, []);

  const logout = useCallback(() => {
    setToken(null);
    setUser(null);
    setAuthToken(null);
    _storedToken = null;
    _storedUser = null;
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
