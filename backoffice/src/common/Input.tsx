import type { InputHTMLAttributes, ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

export function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-text">{label}</span>
      {children}
      {error ? (
        <span className="mt-1 block text-sm text-error" role="alert">
          {/* Shared schemas emit i18n keys; a literal server message falls through unchanged. */}
          {t(error)}
        </span>
      ) : null}
    </label>
  );
}

export function Input({ className = '', ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={`min-h-11 w-full rounded-[12px] border border-border-strong bg-white px-3 text-text placeholder:text-muted ${className}`}
      {...props}
    />
  );
}
