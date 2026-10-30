import { createContext, useCallback, useContext, useEffect, useMemo, type ReactNode } from 'react';
import { getErrorMessage, setAccessToken, setOnUnauthorized } from '../lib/api';
import type { AuthResponse, AuthUser } from '../lib/types';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import {
  clearAuth,
  setCredentials,
  setReady,
  setSessionMessage as setSessionMessageAction,
} from '../store/authSlice';
import { apiSlice, useLoginMutation, useLogoutMutation, useRefreshMutation } from '../store/api';

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

  /**
   * The credential payloads report `role` from the retired identity column, which is
   * NULL for anyone who self-registered (D13). `/auth/me` resolves the role from the
   * active membership, so prefer that record once a token is available.
   */
  const resolveAuthoritativeUser = useCallback(
    async (fallback: AuthResponse): Promise<AuthResponse> => {
      try {
        const me = await dispatch(
          apiSlice.endpoints.me.initiate(undefined, { forceRefetch: true }),
        ).unwrap();
        return me ? { ...fallback, user: me } : fallback;
      } catch {
        // A refinement, never a hard failure: keep the credential payload.
        return fallback;
      }
    },
    [dispatch],
  );

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
        const authoritative = await resolveAuthoritativeUser(data);
        if (!cancelled) dispatch(setCredentials(authoritative));
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
  }, [dispatch, refreshMut, resolveAuthoritativeUser]);

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
        // Refine once the token is in the store, so /auth/me is authorized (D13).
        dispatch(setCredentials(await resolveAuthoritativeUser(data)));
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
    [user, ready, sessionMessage, dispatch, loginMut, logoutMut, resolveAuthoritativeUser],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

export { getErrorMessage };
