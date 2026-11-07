import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useDispatch } from 'react-redux';
import type {
  PortalAcceptInviteInput,
  PortalAuthResponse,
  PortalLoginInput,
  PortalMe,
  PortalProfileInput,
  PortalRegisterInput,
} from '@riaya/shared';
import { portalApi } from './api';
import {
  portalHttp,
  refreshPortalSession,
  setPortalAccessToken,
  setPortalDisabledHandler,
  setPortalUnauthorizedHandler,
} from './lib/session';
import { readRememberedClinic, rememberClinic, type RememberedClinic } from './lib/storage';
import { safeZone } from './lib/slots';

type Status = 'loading' | 'authenticated' | 'anonymous';

interface PortalAuthValue {
  status: Status;
  me: PortalMe | null;
  /** The clinic switched the portal off; the patient was signed out. */
  disabled: boolean;
  /** IANA zone of the patient clinic (remembered at sign-in; browser zone as the last resort). */
  timeZone: string;
  login: (input: PortalLoginInput, clinic?: RememberedClinic) => Promise<PortalMe>;
  register: (input: PortalRegisterInput, clinic?: RememberedClinic) => Promise<PortalMe>;
  acceptInvite: (input: PortalAcceptInviteInput) => Promise<PortalMe>;
  logout: () => Promise<void>;
  updateMe: (patch: PortalProfileInput) => Promise<PortalMe>;
}

const PortalAuthContext = createContext<PortalAuthValue | null>(null);

/**
 * Patient session. Boot does a silent refresh (httpOnly cookie) so a reload keeps the patient
 * signed in; the access token itself lives only in memory (`lib/session.ts`).
 */
export function PortalAuthProvider({ children }: { children: ReactNode }) {
  const dispatch = useDispatch();
  const [status, setStatus] = useState<Status>('loading');
  const [me, setMe] = useState<PortalMe | null>(null);
  const [disabled, setDisabled] = useState(false);
  const [clinic, setClinic] = useState<RememberedClinic | null>(() => readRememberedClinic());

  const applySession = useCallback((auth: PortalAuthResponse) => {
    setPortalAccessToken(auth.accessToken);
    setDisabled(false);
    setMe(auth.me);
    setStatus('authenticated');
    return auth.me;
  }, []);

  const clearSession = useCallback(() => {
    setPortalAccessToken(null);
    setMe(null);
    setStatus('anonymous');
    dispatch(portalApi.util.resetApiState());
  }, [dispatch]);

  useEffect(() => {
    let active = true;
    setPortalDisabledHandler(() => {
      if (!active) return;
      setDisabled(true);
      clearSession();
    });
    setPortalUnauthorizedHandler(() => {
      if (active) clearSession();
    });
    refreshPortalSession()
      .then((auth) => {
        if (active) applySession(auth);
      })
      .catch(() => {
        if (active) setStatus('anonymous');
      });
    return () => {
      active = false;
      setPortalUnauthorizedHandler(null);
      setPortalDisabledHandler(null);
    };
  }, [applySession, clearSession]);

  const remember = useCallback((next?: RememberedClinic) => {
    if (!next) return;
    rememberClinic(next);
    setClinic(next);
  }, []);

  const value = useMemo<PortalAuthValue>(
    () => ({
      status,
      me,
      disabled,
      timeZone: safeZone(
        me?.clinicTimezone ?? (clinic && me?.clinicId === clinic.id ? clinic.timezone : null),
      ),
      async login(input, selected) {
        const { data } = await portalHttp.post<PortalAuthResponse>('/auth/login', input);
        remember(selected);
        return applySession(data);
      },
      async register(input, selected) {
        const { data } = await portalHttp.post<PortalAuthResponse>('/auth/register', input);
        remember(selected);
        return applySession(data);
      },
      async acceptInvite(input) {
        const { data } = await portalHttp.post<PortalAuthResponse>('/auth/accept-invite', input);
        return applySession(data);
      },
      async logout() {
        try {
          await portalHttp.post('/auth/logout');
        } finally {
          clearSession();
        }
      },
      async updateMe(patch) {
        const { data } = await portalHttp.patch<PortalMe>('/me', patch);
        setMe(data);
        return data;
      },
    }),
    [status, me, disabled, clinic, remember, applySession, clearSession],
  );

  return <PortalAuthContext.Provider value={value}>{children}</PortalAuthContext.Provider>;
}

export function usePortalAuth(): PortalAuthValue {
  const ctx = useContext(PortalAuthContext);
  if (!ctx) throw new Error('usePortalAuth must be used inside <PortalAuthProvider>');
  return ctx;
}

/** The signed-in patient; only call below `PortalGuard`. */
export function usePortalMe(): PortalMe {
  const { me } = usePortalAuth();
  if (!me) throw new Error('usePortalMe needs a signed-in patient');
  return me;
}
