import { lazy, useCallback } from 'react';
import { useDispatch } from 'react-redux';
import { portalApi } from './api';
import { usePortalAuth } from './PortalAuthContext';
import { getPortalAccessToken, refreshPortalSession } from './lib/session';

// The assistant UI is built separately; the shell only wires the patient session into it.
const AssistantPage = lazy(() =>
  import('./pages/AssistantPage').then((m) => ({ default: m.AssistantPage })),
);

/** `/portal/assistant`: passes the in-memory portal token and a shared-refresh callback. */
export function PortalAssistantRoute() {
  const dispatch = useDispatch();
  const { me } = usePortalAuth();
  const refreshAccessToken = useCallback(
    () =>
      refreshPortalSession()
        .then((auth) => auth.accessToken)
        .catch(() => null),
    [],
  );
  const onChanged = useCallback(() => {
    dispatch(portalApi.util.invalidateTags(['Appointments', 'Summary']));
  }, [dispatch]);

  return (
    <AssistantPage
      getAccessToken={getPortalAccessToken}
      refreshAccessToken={refreshAccessToken}
      consentHref="/portal/profile"
      onChanged={onChanged}
      verified={me?.verified !== false}
    />
  );
}
