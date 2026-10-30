import { useState, type InputHTMLAttributes, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Eye, EyeOff, Lock } from 'lucide-react';

const base =
  'h-13 w-full rounded-[14px] border border-border bg-slate-50/70 ps-12 text-text transition placeholder:text-muted/70 hover:border-slate-300 focus:border-primary focus:bg-white focus:ring-4 focus:ring-primary/10 focus:outline-none';

export function AuthInput({
  icon,
  className = '',
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { icon: ReactNode }) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute inset-y-0 start-0 grid w-12 place-items-center text-muted">
        {icon}
      </span>
      <input className={`${base} pe-4 ${className}`} {...props} />
    </div>
  );
}

export function PasswordInput({ className = '', ...props }: InputHTMLAttributes<HTMLInputElement>) {
  const { t } = useTranslation();
  const [show, setShow] = useState(false);

  return (
    <div className="relative">
      <span className="pointer-events-none absolute inset-y-0 start-0 grid w-12 place-items-center text-muted">
        <Lock size={18} />
      </span>
      <input
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
        {show ? <EyeOff size={18} /> : <Eye size={18} />}
      </button>
    </div>
  );
}

export function AuthSubmit({ children, disabled }: { children: ReactNode; disabled?: boolean }) {
  return (
    <button
      type="submit"
      disabled={disabled}
      className="group inline-flex h-13 w-full items-center justify-center gap-2 rounded-[14px] bg-linear-to-r from-[#17a589] to-[#1565c0] font-semibold text-white shadow-[0_10px_24px_-8px_rgba(21,101,192,0.55)] transition hover:-translate-y-0.5 hover:shadow-[0_14px_28px_-8px_rgba(21,101,192,0.6)] active:translate-y-0 disabled:pointer-events-none disabled:opacity-60"
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
      ? 'border-red-100 bg-red-50 text-error'
      : 'border-primary/15 bg-accent text-primary';
  return (
    <p
      className={`rounded-[14px] border px-4 py-3 text-sm ${styles}`}
      role={tone === 'error' ? 'alert' : 'status'}
    >
      {children}
    </p>
  );
}
