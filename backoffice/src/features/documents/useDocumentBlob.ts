import { useEffect, useState } from 'react';
import { api } from '../../lib/api';

/** Fetches a document file with the staff token and exposes a blob URL, revoked on unmount. */
export function useDocumentBlob(patientId: string, docId: string) {
  const [state, setState] = useState<{ url: string | null; loading: boolean; failed: boolean }>({
    url: null,
    loading: true,
    failed: false,
  });

  useEffect(() => {
    let created: string | null = null;
    let live = true;
    setState({ url: null, loading: true, failed: false });
    api
      .get<Blob>(`/api/patients/${patientId}/documents/${docId}/file`, { responseType: 'blob' })
      .then(({ data }) => {
        if (!live) return;
        created = URL.createObjectURL(data);
        setState({ url: created, loading: false, failed: false });
      })
      .catch(() => live && setState({ url: null, loading: false, failed: true }));
    return () => {
      live = false;
      if (created) URL.revokeObjectURL(created);
    };
  }, [patientId, docId]);

  return state;
}
