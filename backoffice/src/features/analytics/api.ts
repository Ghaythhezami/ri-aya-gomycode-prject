import type { AnalyticsDto, AnalyticsScope, SchedulingInsights } from '@riaya/shared';
import { api } from '../../lib/api';
import { clinicApi } from '../../store/clinicApi';
import { filenameFromDisposition } from './ranges';

export interface AnalyticsParams {
  from: string;
  to: string;
  scope: AnalyticsScope;
}

const analyticsApi = clinicApi.injectEndpoints({
  endpoints: (build) => ({
    analytics: build.query<AnalyticsDto, AnalyticsParams>({
      query: (params) => ({ url: '/api/analytics', params: { ...params } }),
      providesTags: ['Analytics'],
    }),
    insights: build.query<SchedulingInsights, { from: string; to: string }>({
      query: (params) => ({ url: '/api/analytics/insights', params: { ...params } }),
      providesTags: ['Analytics'],
    }),
  }),
});

export const { useAnalyticsQuery, useInsightsQuery } = analyticsApi;

/** Download an export through the authenticated client and hand it to the browser. */
export async function downloadExport(
  kind: 'csv' | 'pdf',
  params: AnalyticsParams,
): Promise<string> {
  const response = await api.get<Blob>(`/api/analytics/export.${kind}`, {
    params,
    responseType: 'blob',
  });
  const filename = filenameFromDisposition(
    response.headers['content-disposition'] as string | undefined,
    `analytics-${params.from}_${params.to}.${kind}`,
  );
  const url = URL.createObjectURL(response.data);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  return filename;
}
