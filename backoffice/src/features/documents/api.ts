import type {
  PatientDocumentDetail,
  PatientDocumentDto,
  PatientSummaryDto,
  SaveSummaryInput,
  SummaryDraft,
} from '@riaya/shared';
import { clinicApi } from '../../store/clinicApi';

const docsTag = (patientId: string) => ({ type: 'Patient' as const, id: `docs:${patientId}` });
const summariesTag = (patientId: string) => ({
  type: 'Patient' as const,
  id: `summaries:${patientId}`,
});

export const documentsApi = clinicApi.injectEndpoints({
  endpoints: (build) => ({
    patientDocuments: build.query<PatientDocumentDto[], string>({
      query: (patientId) => ({ url: `/api/patients/${patientId}/documents` }),
      providesTags: (_r, _e, patientId) => [docsTag(patientId)],
    }),
    patientDocument: build.query<PatientDocumentDetail, { patientId: string; docId: string }>({
      query: ({ patientId, docId }) => ({ url: `/api/patients/${patientId}/documents/${docId}` }),
      providesTags: (_r, _e, { patientId }) => [docsTag(patientId)],
    }),
    uploadDocument: build.mutation<PatientDocumentDto, { patientId: string; file: File }>({
      query: ({ patientId, file }) => {
        const body = new FormData();
        body.append('file', file);
        return { url: `/api/patients/${patientId}/documents`, method: 'POST', body };
      },
      invalidatesTags: (_r, _e, { patientId }) => [docsTag(patientId)],
    }),
    reviewDocument: build.mutation<PatientDocumentDto, { patientId: string; docId: string }>({
      query: ({ patientId, docId }) => ({
        url: `/api/patients/${patientId}/documents/${docId}/review`,
        method: 'POST',
      }),
      invalidatesTags: (_r, _e, { patientId }) => [docsTag(patientId)],
    }),
    processDocument: build.mutation<PatientDocumentDto, { patientId: string; docId: string }>({
      query: ({ patientId, docId }) => ({
        url: `/api/patients/${patientId}/documents/${docId}/process`,
        method: 'POST',
      }),
      invalidatesTags: (_r, _e, { patientId }) => [docsTag(patientId)],
    }),
    deleteDocument: build.mutation<void, { patientId: string; docId: string }>({
      query: ({ patientId, docId }) => ({
        url: `/api/patients/${patientId}/documents/${docId}`,
        method: 'DELETE',
      }),
      invalidatesTags: (_r, _e, { patientId }) => [docsTag(patientId)],
    }),
    patientSummaries: build.query<PatientSummaryDto[], string>({
      query: (patientId) => ({ url: `/api/patients/${patientId}/summaries` }),
      providesTags: (_r, _e, patientId) => [summariesTag(patientId)],
    }),
    draftSummary: build.mutation<SummaryDraft, string>({
      query: (patientId) => ({ url: `/api/patients/${patientId}/summary/draft`, method: 'POST' }),
    }),
    saveSummary: build.mutation<PatientSummaryDto, { patientId: string; body: SaveSummaryInput }>({
      query: ({ patientId, body }) => ({
        url: `/api/patients/${patientId}/summaries`,
        method: 'POST',
        body,
      }),
      invalidatesTags: (_r, _e, { patientId }) => [summariesTag(patientId)],
    }),
    updateSummary: build.mutation<
      PatientSummaryDto,
      { patientId: string; summaryId: string; body: Partial<SaveSummaryInput> }
    >({
      query: ({ patientId, summaryId, body }) => ({
        url: `/api/patients/${patientId}/summaries/${summaryId}`,
        method: 'PATCH',
        body,
      }),
      invalidatesTags: (_r, _e, { patientId }) => [summariesTag(patientId)],
    }),
  }),
});

export const {
  usePatientDocumentsQuery,
  usePatientDocumentQuery,
  useUploadDocumentMutation,
  useReviewDocumentMutation,
  useProcessDocumentMutation,
  useDeleteDocumentMutation,
  usePatientSummariesQuery,
  useDraftSummaryMutation,
  useSaveSummaryMutation,
  useUpdateSummaryMutation,
} = documentsApi;
