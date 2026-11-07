import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Eye, EyeOff } from 'lucide-react';
import { Field, Input } from '../../common/Input';
import { passwordChecks, passwordStrength } from '../lib/schemas';

const METER_TONE = ['bg-border', 'bg-error', 'bg-warning', 'bg-primary', 'bg-success'] as const;

/** Password input with show/hide, the policy as a checklist and a labelled strength meter. */
export function PasswordField({
  label,
  value,
  onChange,
  onBlur,
  name,
  error,
  autoComplete = 'new-password',
  showPolicy = true,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  name?: string;
  error?: string;
  autoComplete?: string;
  showPolicy?: boolean;
}) {
  const { t } = useTranslation();
  const [visible, setVisible] = useState(false);
  const policyId = useId();
  const strength = passwordStrength(value);

  return (
    <div>
      <Field label={label} error={error}>
        <div className="relative">
          <Input
            name={name}
            type={visible ? 'text' : 'password'}
            dir="ltr"
            value={value}
            autoComplete={autoComplete}
            onChange={(e) => onChange(e.target.value)}
            onBlur={onBlur}
            className="pe-12 text-start"
            aria-describedby={showPolicy ? policyId : undefined}
          />
        </div>
      </Field>
      <button
        type="button"
        aria-pressed={visible}
        onClick={() => setVisible((v) => !v)}
        className="mt-1 inline-flex min-h-10 items-center gap-1.5 rounded-md px-2 text-sm text-primary hover:bg-accent"
      >
        {visible ? <EyeOff size={16} aria-hidden /> : <Eye size={16} aria-hidden />}
        {visible ? t('portal.password.hide') : t('portal.password.show')}
      </button>
      {showPolicy ? (
        <div id={policyId} className="mt-1 space-y-2">
          <div className="flex items-center gap-2" aria-live="polite">
            <div className="flex flex-1 gap-1" aria-hidden>
              {[1, 2, 3, 4].map((n) => (
                <span
                  key={n}
                  className={`h-1.5 flex-1 rounded-full ${n <= strength ? METER_TONE[strength] : 'bg-border'}`}
                />
              ))}
            </div>
            <span className="min-w-16 text-xs font-medium text-text">
              {t(`portal.password.strength.${strength}`)}
            </span>
          </div>
          <ul className="grid gap-1 text-xs sm:grid-cols-2">
            {passwordChecks(value).map((check) => (
              <li key={check.id} className={check.ok ? 'text-success' : 'text-muted'}>
                <span aria-hidden>{check.ok ? '✓ ' : '○ '}</span>
                {t(`portal.password.rules.${check.id}`)}
                <span className="sr-only">
                  {' '}
                  {check.ok ? t('portal.password.met') : t('portal.password.notMet')}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
