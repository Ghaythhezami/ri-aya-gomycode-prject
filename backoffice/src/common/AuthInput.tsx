import { forwardRef, useState, type InputHTMLAttributes, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Eye, EyeOff, Lock } from 'lucide-react';

const base =
  'min-h-13 w-full rounded-lg border border-border-strong/50 bg-surface-muted/70 ps-12 text-text transition placeholder:text-muted hover:border-border-strong focus:border-primary focus:bg-surface focus:ring-4 focus:ring-primary/10 focus:outline-none aria-[invalid=true]:border-error aria-[invalid=true]:ring-error/10';

type AuthInputProps = InputHTMLAttributes<HTMLInputElement> & { icon: ReactNode };

/** Large, icon-led text field used only on the full-bleed auth screens. */
export const AuthInput = forwardRef<HTMLInputElement, AuthInputProps>(function AuthInput(
  { icon, className = '', ...props },
  ref,
) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute inset-y-0 start-0 grid w-12 place-items-center text-muted">
        {icon}
      </span>
      <input ref={ref} className={`${base} pe-4 ${className}`} {...props} />
    </div>
  );
});

export const PasswordInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function PasswordInput({ className = '', ...props }, ref) {
    const { t } = useTranslation();
    const [show, setShow] = useState(false);

    return (
      <div className="relative">
        <span className="pointer-events-none absolute inset-y-0 start-0 grid w-12 place-items-center text-muted">
          <Lock size={18} aria-hidden="true" />
        </span>
        <input
          ref={ref}
          type={show ? 'text' : 'password'}
          className={`${base} pe-12 ${className}`}
          {...props}
        />
        <button
          type="button"
          className="absolute inset-y-0 end-0 grid w-12 place-items-center text-muted transition hover:text-primary"
          onClick={() => setShow((value) => !value)}
          aria-label={show ? t('auth.hidePassword') : t('auth.showPassword')}
        >
          {show ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
        </button>
      </div>
    );
  },
);

export function AuthSubmit({ children, disabled }: { children: ReactNode; disabled?: boolean }) {
  return (
    <button
      type="submit"
      disabled={disabled}
      className="btn-brand group inline-flex min-h-13 w-full items-center justify-center gap-2 rounded-lg font-semibold text-white disabled:pointer-events-none disabled:opacity-60"
    >
      {children}
    </button>
  );
}

export function AuthAlert({
  tone = 'error',
  children,
}: {
  tone?: 'error' | 'success';
  children: ReactNode;
}) {
  const styles =
    tone === 'error'
      ? 'border-error/20 bg-error/5 text-error'
      : 'border-primary/15 bg-accent text-primary';
  return (
    <p
      className={`rounded-lg border px-4 py-3 text-sm ${styles}`}
      role={tone === 'error' ? 'alert' : 'status'}
    >
      {children}
    </p>
  );
}
