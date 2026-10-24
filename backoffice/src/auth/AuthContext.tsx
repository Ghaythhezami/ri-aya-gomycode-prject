import { createContext, useContext, useEffect, useMemo, type ReactNode } from 'react';
import { getErrorMessage, setAccessToken, setOnUnauthorized } from '../lib/api';
import type { AuthUser } from '../lib/types';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import {
  clearAuth,
  setCredentials,
  setReady,
  setSessionMessage as setSessionMessageAction,
} from '../store/authSlice';
import { useLoginMutation, useLogoutMutation, useRefreshMutation } from '../store/api';

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
  const dispatch = useAppDispatch();
  const user = useAppSelector((state) => state.auth.user);
  const ready = useAppSelector((state) => state.auth.ready);
  const sessionMessage = useAppSelector((state) => state.auth.sessionMessage);
  const [loginMut] = useLoginMutation();
  const [logoutMut] = useLogoutMutation();
  const [refreshMut] = useRefreshMutation();

  useEffect(() => {
    setOnUnauthorized(() => {
      setAccessToken(null);
      dispatch(clearAuth());
      dispatch(setSessionMessageAction('auth.sessionExpired'));
    });
    return () => setOnUnauthorized(null);
  }, [dispatch]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await refreshMut().unwrap();
        setAccessToken(data.accessToken);
        if (!cancelled) dispatch(setCredentials(data));
      } catch {
        setAccessToken(null);
        if (!cancelled) dispatch(clearAuth());
      } finally {
        if (!cancelled) dispatch(setReady(true));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [dispatch, refreshMut]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      ready,
      sessionMessage,
      setSessionMessage: (message) => dispatch(setSessionMessageAction(message)),
      async login(email: string, password: string) {
        const data = await loginMut({ email, password }).unwrap();
        setAccessToken(data.accessToken);
        dispatch(setCredentials(data));
      },
      async logout() {
        try {
          await logoutMut().unwrap();
        } finally {
          setAccessToken(null);
          dispatch(clearAuth());
        }
      },
    }),
    [user, ready, sessionMessage, dispatch, loginMut, logoutMut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

export { getErrorMessage };
