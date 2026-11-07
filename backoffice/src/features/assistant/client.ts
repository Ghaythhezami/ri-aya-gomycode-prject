import { getAccessToken, refreshSession } from '../../lib/api';
import type { AssistantTransport } from './stream';

const origin = import.meta.env.VITE_API_BASE_URL || '';

export interface AssistantClient {
  transport: AssistantTransport;
  /** Endpoint prefix: `/api/assistant` (staff) or `/api/portal/assistant` (patient). */
  base: string;
}

/** Staff and doctor client: the in-memory staff token and the shared single-flight refresh. */
export const staffAssistantClient: AssistantClient = {
  base: '/api/assistant',
  transport: {
    origin,
    getToken: getAccessToken,
    refresh: async () => (await refreshSession()).accessToken ?? null,
  },
};

/** Patient client: the caller supplies the portal access token (and optionally its refresh). */
export function createPortalAssistantClient(options: {
  getAccessToken: () => string | null;
  refreshAccessToken?: () => Promise<string | null>;
}): AssistantClient {
  return {
    base: '/api/portal/assistant',
    transport: { origin, getToken: options.getAccessToken, refresh: options.refreshAccessToken },
  };
}
