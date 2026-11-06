import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useClinicFormat } from '../shared/format';
import { useGlobalSearchAppointmentsQuery, useGlobalSearchPatientsQuery } from './api';
import { SearchCombobox, type SearchComboboxLabels, type SearchOption } from './SearchCombobox';
import { useDebounced } from './useDebounced';

/**
 * Global search in the top bar: patients and appointments in one keyboard-navigable
 * listbox. Enter opens `/patients/:id` or `/appointments/:id`.
 */
export function GlobalSearch({ onNavigate }: { onNavigate?: () => void }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const format = useClinicFormat();
  const [query, setQuery] = useState('');
  const term = useDebounced(query.trim(), 250);
  const active = term.length >= 2;

  const patients = useGlobalSearchPatientsQuery(term, { skip: !active });
  const appointments = useGlobalSearchAppointmentsQuery(term, { skip: !active });

  const options = useMemo<SearchOption[]>(() => {
    if (!active) return [];
    const patientOptions = (patients.data?.items ?? []).map<SearchOption>((patient) => ({
      id: patient.id,
      kind: 'patient',
      title: patient.name,
      subtitle: `${patient.code} · ${patient.phoneMasked}`,
      label: `${t('search.groups.patient')}: ${patient.name}`,
    }));
    const appointmentOptions = (appointments.data?.items ?? []).map<SearchOption>((item) => ({
      id: item.id,
      kind: 'appointment',
      title: `${item.code} · ${item.patient.name}`,
      subtitle: `${item.doctor.name} · ${format.dateTime(item.startsAt)}`,
      label: `${t('search.groups.appointment')}: ${item.code}, ${item.patient.name}`,
    }));
    return [...patientOptions, ...appointmentOptions];
    // `format` is rebuilt every render; its inputs (locale, zone) are what matter.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, patients.data, appointments.data, t, format.locale, format.timeZone]);

  const labels: SearchComboboxLabels = {
    input: t('search.label'),
    placeholder: t('shell.search'),
    empty: t('search.empty', { query: term }),
    error: t('search.error'),
    loading: t('clinic.loading'),
    groups: { patient: t('search.groups.patient'), appointment: t('search.groups.appointment') },
  };

  return (
    <SearchCombobox
      query={query}
      onQueryChange={setQuery}
      options={options}
      loading={query.trim() !== term || patients.isFetching || appointments.isFetching}
      failed={Boolean(patients.isError && appointments.isError)}
      labels={labels}
      onSelect={(option) => {
        setQuery('');
        onNavigate?.();
        navigate(
          option.kind === 'patient' ? `/patients/${option.id}` : `/appointments/${option.id}`,
        );
      }}
    />
  );
}
