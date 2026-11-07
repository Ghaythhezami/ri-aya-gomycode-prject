import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router-dom';
import { Sparkles, X } from 'lucide-react';
import { useAuth } from '../../auth/AuthContext';
import { useAppDispatch } from '../../store/hooks';
import { clinicApi } from '../../store/clinicApi';
import { useClinicFormat } from '../shared/format';
import { useAssistantStatusQuery } from './api';
import { AssistantPanel } from './AssistantPanel';
import { staffAssistantClient } from './client';
import { launcherVisible, pageContext, staffPersona } from './launcherState';
import { useDialogFocus } from './useDialogFocus';

/**
 * Floating assistant button (stacked above the team-chat launcher) opening a slide-over.
 * Rendered only when `GET /api/assistant/status` reports the assistant as enabled.
 */
export function AssistantLauncher() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { pathname } = useLocation();
  const fmt = useClinicFormat();
  const dispatch = useAppDispatch();
  const { data: status } = useAssistantStatusQuery(undefined, { skip: !user });
  const [open, setOpen] = useState(false);
  const launcher = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLElement>(null);

  useDialogFocus(open, panel, () => setOpen(false), launcher);

  if (!launcherVisible(status)) return null;
  const persona = staffPersona(status);
  const title = t(`assistant.persona.${persona}`);

  return (
    <>
      <button
        ref={launcher}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={t('assistant.open', { persona: title })}
        className="fixed bottom-20 end-4 z-30 grid size-14 place-items-center rounded-full border border-border-strong bg-surface text-primary shadow-(--shadow-overlay) hover:bg-accent"
      >
        <Sparkles size={24} aria-hidden="true" />
      </button>

      {open && (
        <div className="fixed inset-0 z-40">
          <button
            type="button"
            tabIndex={-1}
            aria-label={t('assistant.close')}
            className="absolute inset-0 bg-navy/40"
            onClick={() => setOpen(false)}
          />
          <section
            ref={panel}
            role="dialog"
            aria-modal="true"
            aria-label={title}
            tabIndex={-1}
            className="absolute inset-y-0 end-0 flex w-full flex-col bg-bg shadow-(--shadow-overlay) sm:max-w-md"
          >
            <header className="flex items-center justify-between gap-2 border-b border-border bg-surface px-4 py-3">
              <h2 className="flex items-center gap-2 text-base font-semibold text-text">
                <Sparkles size={18} aria-hidden="true" className="text-primary" />
                {title}
              </h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label={t('assistant.close')}
                className="grid size-11 place-items-center rounded-md text-text hover:bg-accent"
              >
                <X size={18} aria-hidden="true" />
              </button>
            </header>
            <AssistantPanel
              persona={persona}
              client={staffAssistantClient}
              context={pageContext(pathname, fmt.localDate())}
              onChanged={() =>
                dispatch(
                  clinicApi.util.invalidateTags([
                    'Appointment',
                    'Dashboard',
                    'Schedule',
                    'Queue',
                    'Patient',
                    'Doctor',
                  ]),
                )
              }
              className="min-h-0 flex-1"
            />
          </section>
        </div>
      )}
    </>
  );
}
