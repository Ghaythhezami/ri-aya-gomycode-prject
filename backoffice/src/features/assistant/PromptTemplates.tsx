import { useTranslation } from 'react-i18next';
import {
  CalendarClock,
  CalendarPlus,
  ClipboardList,
  HeartPulse,
  Hospital,
  NotebookPen,
  Sun,
  Users,
  type LucideIcon,
} from 'lucide-react';
import type { AssistantPersona } from '@riaya/shared';
import { hasBlank, templatesFor, type TemplateCategory } from './templateCatalogue';

const CATEGORY_ICON: Record<TemplateCategory, LucideIcon> = {
  today: Sun,
  booking: CalendarPlus,
  patients: Users,
  day: CalendarClock,
  writing: NotebookPen,
  appointments: CalendarPlus,
  health: HeartPulse,
  clinic: Hospital,
};

/**
 * Prompt template library, grouped by category. `onPick` gets the localised prompt and whether
 * it still has a `[blank]` to fill (the panel then puts it in the composer instead of sending).
 */
export function PromptTemplates({
  persona,
  hasPatientContext,
  onPick,
  disabled,
}: {
  persona: AssistantPersona;
  hasPatientContext: boolean;
  onPick: (prompt: string, needsInput: boolean) => void;
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  const groups = templatesFor(persona, hasPatientContext);
  return (
    <div className="space-y-4">
      {groups.map((group) => {
        const Icon = CATEGORY_ICON[group.category] ?? ClipboardList;
        const headingId = `tpl-${persona}-${group.category}`;
        return (
          <section key={group.category} aria-labelledby={headingId}>
            <h4
              id={headingId}
              className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted"
            >
              <Icon size={14} aria-hidden="true" />
              {t(`assistant.templates.categories.${group.category}`)}
            </h4>
            <ul className="grid gap-1.5">
              {group.templates.map((tpl) => {
                const label = t(`assistant.templates.${persona}.${tpl.id}.label`);
                const prompt = t(`assistant.templates.${persona}.${tpl.id}.prompt`);
                const needsInput = hasBlank(prompt);
                return (
                  <li key={tpl.id}>
                    <button
                      type="button"
                      disabled={disabled}
                      onClick={() => onPick(prompt, needsInput)}
                      className="group flex min-h-11 w-full items-start gap-2 rounded-md border border-border bg-surface px-3 py-2 text-start hover:border-primary hover:bg-accent focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-50"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-medium text-text">{label}</span>
                        <span className="mt-0.5 line-clamp-2 block text-xs text-muted">
                          {prompt}
                        </span>
                      </span>
                      <span className="mt-0.5 shrink-0 rounded-full bg-bg px-2 py-0.5 text-[11px] font-medium text-muted group-hover:bg-surface">
                        {needsInput ? t('assistant.templates.fill') : t('assistant.templates.ask')}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
