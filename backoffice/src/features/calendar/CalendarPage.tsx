import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ChevronLeft, ChevronRight, List, Plus } from 'lucide-react';
import { can } from '@riaya/shared';
import { useAuth } from '../../auth/AuthContext';
import { Button } from '../../common/Button';
import { Select } from '../../common/Input';
import { Skeleton } from '../../common/Skeleton';
import { ErrorState } from '../../common/States';
import { asClinicError } from '../../store/clinicApi';
import { useApptCalendarQuery } from '../appointments/api';
import { openBooking } from '../booking/booking-launcher';
import { useClinicReferenceQuery } from '../shared/api';
import { useClinicFormat } from '../shared/format';
import { PageHeader } from '../shared/PageHeader';
import { AgendaList } from './AgendaList';
import {
  formatYmd,
  formatYmdRange,
  isYmd,
  monthGrid,
  shiftView,
  todayInZone,
  viewRange,
  weekDays,
  zonedParts,
  type CalendarView,
} from './dates';
import { groupByDay, hourRange } from './model';
import { MonthGrid } from './MonthGrid';
import { TimeGrid, useSlotHandler } from './TimeGrid';

const VIEWS: CalendarView[] = ['day', 'week', 'month'];

const MOBILE_QUERY = '(max-width: 767px)';

function useIsMobile(): boolean {
  return useSyncExternalStore(
    (listener) => {
      const media = window.matchMedia(MOBILE_QUERY);
      media.addEventListener('change', listener);
      return () => media.removeEventListener('change', listener);
    },
    () => window.matchMedia(MOBILE_QUERY).matches,
    () => false,
  );
}

export function CalendarPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const format = useClinicFormat();
  const { user } = useAuth();
  const manage = can(user?.role, 'manageAppointments');
  const reference = useClinicReferenceQuery();
  const [params, setParams] = useSearchParams();
  const isMobile = useIsMobile();

  const timeZone = format.timeZone;
  const locale = i18n.resolvedLanguage ?? 'en';
  const today = todayInZone(timeZone);

  const viewParam = params.get('view');
  const view: CalendarView = VIEWS.includes(viewParam as CalendarView)
    ? (viewParam as CalendarView)
    : 'week';
  const dateParam = params.get('date');
  const date = isYmd(dateParam) ? dateParam : today;
  const doctorId = params.get('doctorId') ?? '';

  function setState(
    next: { view?: CalendarView; date?: string; doctorId?: string },
    replace = false,
  ) {
    const merged = { view, date, doctorId, ...next };
    const out = new URLSearchParams();
    out.set('view', merged.view);
    out.set('date', merged.date);
    if (merged.doctorId) out.set('doctorId', merged.doctorId);
    setParams(out, { replace });
  }

  const range = viewRange(view, date);
  const { data, isLoading, isFetching, isError, error, refetch } = useApptCalendarQuery(
    { from: range.from, to: range.to, doctorId: doctorId || undefined },
    { pollingInterval: 60_000, skipPollingIfUnfocused: true },
  );

  // Layout is computed once per data set, not per render.
  const byDay = useMemo(() => groupByDay(data ?? [], timeZone), [data, timeZone]);

  const days = useMemo(
    () => (view === 'day' ? [date] : view === 'week' ? weekDays(date) : monthGrid(date)),
    [view, date],
  );
  const { startHour, endHour } = useMemo(
    () => hourRange(days.map((ymd) => byDay.get(ymd) ?? [])),
    [days, byDay],
  );

  // The current-time line moves once a minute.
  const [nowMinutes, setNowMinutes] = useState(() => zonedParts(new Date(), timeZone).minutes);
  useEffect(() => {
    const tick = () => setNowMinutes(zonedParts(new Date(), timeZone).minutes);
    tick();
    const timer = window.setInterval(tick, 60_000);
    return () => window.clearInterval(timer);
  }, [timeZone]);

  const onOpen = useCallback((id: string) => navigate(`/appointments/${id}`), [navigate]);
  const goToDay = useCallback(
    (ymd: string) => {
      const out = new URLSearchParams({ view: 'day', date: ymd });
      if (doctorId) out.set('doctorId', doctorId);
      setParams(out);
    },
    [doctorId, setParams],
  );
  const onBook = useCallback(
    (startsAt: string) => openBooking({ startsAt, ...(doctorId ? { doctorId } : {}) }),
    [doctorId],
  );
  const onSlot = useSlotHandler(timeZone, reference.data?.slotMinutes ?? 30, onBook);

  const rangeLabel =
    view === 'month'
      ? formatYmd(date, locale, { month: 'long', year: 'numeric' })
      : view === 'day'
        ? formatYmd(date, locale, {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
            year: 'numeric',
          })
        : formatYmdRange(range.from, range.to, locale);

  const clinicError = asClinicError(error);
  const listParams = new URLSearchParams({ from: range.from, to: range.to });
  if (doctorId) listParams.set('doctorId', doctorId);
  const count = data?.length ?? 0;

  return (
    <div>
      <PageHeader
        eyebrow={t('calendar.eyebrow')}
        title={t('calendar.title')}
        subtitle={t('calendar.subtitle')}
        actions={
          manage ? (
            <Button onClick={() => openBooking(doctorId ? { doctorId } : {})}>
              <Plus size={16} aria-hidden="true" />
              {t('shell.newAppointment')}
            </Button>
          ) : null
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-3 rounded-lg border border-border bg-surface p-3 shadow-(--shadow-card)">
        <Button variant="secondary" size="sm" onClick={() => setState({ date: today })}>
          {t('clinic.today')}
        </Button>
        <div className="flex items-center">
          <button
            type="button"
            onClick={() => setState({ date: shiftView(view, date, -1) })}
            aria-label={t('calendar.prev')}
            className="grid size-10 place-items-center rounded-md text-muted hover:bg-bg"
          >
            <ChevronLeft size={18} aria-hidden="true" className="rtl:-scale-x-100" />
          </button>
          <button
            type="button"
            onClick={() => setState({ date: shiftView(view, date, 1) })}
            aria-label={t('calendar.next')}
            className="grid size-10 place-items-center rounded-md text-muted hover:bg-bg"
          >
            <ChevronRight size={18} aria-hidden="true" className="rtl:-scale-x-100" />
          </button>
        </div>
        <h2 aria-live="polite" className="text-sm font-semibold text-text">
          {rangeLabel}
          <span className="sr-only"> {t('calendar.appointmentsCount', { count })}</span>
        </h2>

        <label className="ms-auto inline-flex">
          <span className="sr-only">{t('calendar.doctor')}</span>
          <Select
            value={doctorId}
            onChange={(event) => setState({ doctorId: event.target.value }, true)}
            className="w-auto min-w-40"
          >
            <option value="">{t('appointments.allDoctors')}</option>
            {(reference.data?.doctors ?? []).map((doctor) => (
              <option key={doctor.id} value={doctor.id}>
                {doctor.name}
              </option>
            ))}
          </Select>
        </label>

        <Link
          to={`/appointments?${listParams.toString()}`}
          className="inline-flex min-h-10 items-center gap-1.5 rounded-md border border-border px-3 text-sm text-text hover:bg-bg"
        >
          <List size={16} aria-hidden="true" />
          {t('calendar.list')}
        </Link>

        <div
          role="group"
          aria-label={t('calendar.viewLabel')}
          className="inline-flex rounded-md bg-bg p-1"
        >
          {VIEWS.map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={view === option}
              onClick={() => setState({ view: option })}
              className={`min-h-9 rounded-md px-3 text-xs ${
                view === option
                  ? 'bg-primary font-semibold text-white'
                  : 'text-muted hover:text-text'
              }`}
            >
              {t(`calendar.views.${option}`)}
            </button>
          ))}
        </div>
      </div>

      <div aria-busy={isFetching}>
        {isLoading ? (
          <Skeleton className="h-[32rem]" />
        ) : isError && !data ? (
          <ErrorState
            title={t('calendar.errorTitle')}
            description={t(`errors.${clinicError?.code ?? 'generic'}`, {
              defaultValue: clinicError?.message,
            })}
            action={
              <Button variant="secondary" onClick={() => void refetch()}>
                {t('clinic.retry')}
              </Button>
            }
          />
        ) : view === 'month' ? (
          <MonthGrid
            days={days}
            month={date}
            byDay={byDay}
            today={today}
            locale={locale}
            onOpen={onOpen}
            onDay={goToDay}
          />
        ) : isMobile ? (
          <AgendaList days={days} byDay={byDay} today={today} locale={locale} />
        ) : (
          <TimeGrid
            days={days}
            byDay={byDay}
            today={today}
            nowMinutes={nowMinutes}
            startHour={startHour}
            endHour={endHour}
            timeZone={timeZone}
            locale={locale}
            onOpen={onOpen}
            onSlot={manage ? onSlot : null}
            onDayHeader={goToDay}
          />
        )}
        {data && data.length === 0 && !isLoading && view !== 'month' && !isMobile ? (
          <p className="mt-3 text-center text-sm text-muted">{t('calendar.emptyRange')}</p>
        ) : null}
      </div>
    </div>
  );
}
