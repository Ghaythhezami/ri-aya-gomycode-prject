import type { ButtonHTMLAttributes } from 'react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

const variants: Record<Variant, string> = {
  primary: 'bg-primary text-white hover:bg-primary-dark disabled:opacity-60',
  secondary: 'bg-white text-text border border-border hover:bg-bg disabled:opacity-60',
  ghost: 'bg-transparent text-text hover:bg-accent disabled:opacity-60',
  danger: 'bg-error text-white hover:opacity-90 disabled:opacity-60',
};

const sizes: Record<Size, string> = {
  sm: 'min-h-10 px-3 text-sm',
  md: 'min-h-11 px-4 text-sm',
  lg: 'min-h-12 px-5 text-base',
};

export function Button({
  variant = 'primary',
  size = 'md',
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size }) {
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 rounded-[12px] font-medium transition ${variants[variant]} ${sizes[size]} ${className}`}
      {...props}
    />
  );
}
