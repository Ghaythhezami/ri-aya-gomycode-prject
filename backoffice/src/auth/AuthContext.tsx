import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, getErrorMessage, setAccessToken, setOnUnauthorized } from '../lib/api';
import type { AuthUser } from '../lib/types';

interface AuthContextValue {
  user: AuthUser | null;
  ready: boolean;
  sessionMessage: string | null;
  setSessionMessage: (value: string | null) => void;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [ready, setReady] = useState(false);
  const [sessionMessage, setSessionMessage] = useState<string | null>(null);

  useEffect(() => {
    setOnUnauthorized(() => {
      setUser(null);
      setAccessToken(null);
      setSessionMessage('auth.sessionExpired');
    });
    return () => setOnUnauthorized(null);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await api.post<{ accessToken: string; user: AuthUser }>(
          '/api/auth/refresh',
        );
        setAccessToken(data.accessToken);
        if (!cancelled) setUser(data.user);
      } catch {
        setAccessToken(null);
        if (!cancelled) setUser(null);
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      ready,
      sessionMessage,
      setSessionMessage,
      async login(email: string, password: string) {
        const { data } = await api.post<{ accessToken: string; user: AuthUser }>(
          '/api/auth/login',
          {
            email,
            password,
          },
        );
        setAccessToken(data.accessToken);
        setUser(data.user);
        setSessionMessage(null);
      },
      async logout() {
        try {
          await api.post('/api/auth/logout');
        } finally {
          setAccessToken(null);
          setUser(null);
        }
      },
    }),
    [user, ready, sessionMessage],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

export { getErrorMessage };
