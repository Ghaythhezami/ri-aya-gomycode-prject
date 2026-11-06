import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { CalendarDays, ChevronDown, SlidersHorizontal, Search, Stethoscope } from 'lucide-react';
import { APPOINTMENT_STATUSES } from '@riaya/shared';
import type { AppointmentStatus } from '@riaya/shared';
import { DatePicker } from '../../common/DatePicker';
import { Field, Input, Select } from '../../common/Input';
import { Popover } from '../../common/Popover';
import { addDays, formatYmdRange, startOfWeek } from '../calendar/dates';
import { useClinicReferenceQuery } from '../shared/api';
import { typeFilterOptions, useAppointmentTypesQuery } from '../shared/appointmentTypes';
import { useDebounced } from '../search/useDebounced';
import { moreFiltersCount, type AppointmentFilters } from './filters';
import { useSpecialtyLabel } from '../shared/useSpecialtyLabel';

const TRIGGER =
  'inline-flex min-h-10 items-center gap-2 rounded-md border border-border bg-surface px-3 text-sm text-text hover:bg-bg';

function toggle<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((entry) => entry !== value) : [...list, value];
}

/** Search, date range, doctor, "More filters" and the List / Day / Week switch. */
export function AppointmentsToolbar({
  filters,
  today,
  locale,
  onChange,
}: {
  filters: AppointmentFilters;
  today: string;
  locale: string;
  onChange: (partial: Partial<AppointmentFilters>) => void;
}) {
  const { t } = useTranslation();
  const specialtyLabel = useSpecialtyLabel();
  const navigate = useNavigate();
  const reference = useClinicReferenceQuery();
  const typeOptions = typeFilterOptions(
    useAppointmentTypesQuery({ includeInactive: true }).data ?? [],
  );
  const [text, setText] = useState(filters.search);
  const debounced = useDebounced(text, 300);

  // Keep the box in step when the URL changes elsewhere (reset, back button).
  useEffect(() => setText(filters.search), [filters.search]);
  useEffect(() => {
    if (debounced !== filters.search) onChange({ search: debounced.trim() });
    // Only a settled keystroke should write to the URL.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced]);

  const doctors = reference.data?.doctors ?? [];
  const extra = moreFiltersCount(filters);

  const rangeLabel =
    filters.from && filters.to
      ? formatYmdRange(filters.from, filters.to, locale)
      : filters.from
        ? t('appointments.range.from', { date: formatYmdRange(filters.from, filters.from, locale) })
        : filters.to
          ? t('appointments.range.to', { date: formatYmdRange(filters.to, filters.to, locale) })
          : t('appointments.range.all');

  function openCalendar(view: 'day' | 'week') {
    const params = new URLSearchParams({ view, date: filters.from || today });
    if (filters.doctorId) params.set('doctorId', filters.doctorId);
    navigate(`/calendar?${params.toString()}`);
  }

  const weekStart = startOfWeek(today);

  return (
    <div className="flex flex-wrap items-center gap-3 p-4">
      <div className="relative min-w-56 flex-1">
        <Search
          size={16}
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 start-3 my-auto text-muted"
        />
        <Input
          type="search"
          aria-label={t('appointments.searchLabel')}
          placeholder={t('appointments.searchPlaceholder')}
          value={text}
          onChange={(event) => setText(event.target.value)}
          className="ps-9"
          autoComplete="off"
        />
      </div>

      <Popover
        label={t('appointments.range.label')}
        trigger={({ open, toggle: toggleOpen, ref }) => (
          <button
            ref={ref}
            type="button"
            className={TRIGGER}
            aria-expanded={open}
            aria-haspopup="dialog"
            onClick={toggleOpen}
          >
            <CalendarDays size={16} aria-hidden="true" className="text-muted" />
            <span>{rangeLabel}</span>
            <ChevronDown size={14} aria-hidden="true" className="text-muted" />
          </button>
        )}
      >
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {[
              { id: 'today', from: today, to: today },
              { id: 'week', from: weekStart, to: addDays(weekStart, 6) },
              { id: 'next7', from: today, to: addDays(today, 6) },
            ].map((preset) => (
              <button
                key={preset.id}
                type="button"
                onClick={() => onChange({ from: preset.from, to: preset.to })}
                className="min-h-10 rounded-md border border-border px-3 text-xs text-text hover:bg-accent"
              >
                {t(`appointments.range.${preset.id}`)}
              </button>
            ))}
          </div>
          <DatePicker
            label={t('appointments.range.fromLabel')}
            value={filters.from}
            max={filters.to || undefined}
            locale={locale}
            onChange={(value) => onChange({ from: value })}
          />
          <DatePicker
            label={t('appointments.range.toLabel')}
            value={filters.to}
            min={filters.from || undefined}
            locale={locale}
            onChange={(value) => onChange({ to: value })}
          />
          <button
            type="button"
            onClick={() => onChange({ from: '', to: '' })}
            className="min-h-10 text-sm font-medium text-primary"
          >
            {t('appointments.range.clear')}
          </button>
        </div>
      </Popover>

      <label className="relative inline-flex">
        <span className="sr-only">{t('appointments.fields.doctor')}</span>
        <Stethoscope
          size={16}
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 start-3 my-auto text-muted"
        />
        <Select
          value={filters.doctorId}
          onChange={(event) => onChange({ doctorId: event.target.value })}
          className="w-auto min-w-40 ps-9"
        >
          <option value="">{t('appointments.allDoctors')}</option>
          {doctors.map((doctor) => (
            <option key={doctor.id} value={doctor.id}>
              {doctor.name}
            </option>
          ))}
        </Select>
      </label>

      <Popover
        label={t('appointments.more.title')}
        trigger={({ open, toggle: toggleOpen, ref }) => (
          <button
            ref={ref}
            type="button"
            className={TRIGGER}
            aria-expanded={open}
            aria-haspopup="dialog"
            onClick={toggleOpen}
          >
            <SlidersHorizontal size={16} aria-hidden="true" className="text-muted" />
            {t('appointments.more.title')}
            {extra > 0 ? (
              <span className="grid min-w-5 place-items-center rounded-full bg-primary px-1.5 text-xs text-white">
                {extra}
                <span className="sr-only"> {t('appointments.more.active')}</span>
              </span>
            ) : null}
          </button>
        )}
      >
        <div className="space-y-4">
          <fieldset>
            <legend className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">
              {t('appointments.fields.status')}
            </legend>
            {APPOINTMENT_STATUSES.map((status: AppointmentStatus) => (
              <label key={status} className="flex min-h-10 items-center gap-2 text-sm text-text">
                <input
                  type="checkbox"
                  checked={filters.status.includes(status)}
                  onChange={() => onChange({ status: toggle(filters.status, status) })}
                />
                {t(`clinic.status.${status}`)}
              </label>
            ))}
          </fieldset>
          <fieldset>
            <legend className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">
              {t('appointments.fields.type')}
            </legend>
            {typeOptions.map((option) => (
              <label
                key={option.code}
                className="flex min-h-10 items-center gap-2 text-sm text-text"
              >
                <input
                  type="checkbox"
                  checked={filters.type.includes(option.code)}
                  onChange={() => onChange({ type: toggle(filters.type, option.code) })}
                />
                {option.label}
                {option.inactive ? (
                  <span className="text-xs text-muted">({t('appointments.inactive')})</span>
                ) : null}
              </label>
            ))}
          </fieldset>
          <Field label={t('appointments.fields.specialty')}>
            <Select
              value={filters.specialty}
              onChange={(event) => onChange({ specialty: event.target.value })}
            >
              <option value="">{t('appointments.allSpecialties')}</option>
              {(reference.data?.specialties ?? []).map((name) => (
                <option key={name} value={name}>
                  {specialtyLabel(name)}
                </option>
              ))}
            </Select>
          </Field>
          <button
            type="button"
            onClick={() => onChange({ status: [], type: [], specialty: '' })}
            className="min-h-10 text-sm font-medium text-primary"
          >
            {t('appointments.more.clear')}
          </button>
        </div>
      </Popover>

      <div
        role="group"
        aria-label={t('appointments.view.label')}
        className="ms-auto inline-flex rounded-md bg-bg p-1"
      >
        <button
          type="button"
          aria-pressed="true"
          className="min-h-10 rounded-md bg-primary px-3 text-xs font-semibold text-white"
        >
          {t('appointments.view.list')}
        </button>
        <button
          type="button"
          onClick={() => openCalendar('day')}
          className="min-h-10 rounded-md px-3 text-xs text-muted hover:text-text"
        >
          {t('appointments.view.day')}
        </button>
        <button
          type="button"
          onClick={() => openCalendar('week')}
          className="min-h-10 rounded-md px-3 text-xs text-muted hover:text-text"
        >
          {t('appointments.view.week')}
        </button>
      </div>
    </div>
  );
}
