type Tone = 'success' | 'warning' | 'error' | 'neutral' | 'info';

const tones: Record<Tone, string> = {
  success: 'bg-green-50 text-success',
  warning: 'bg-amber-50 text-warning',
  error: 'bg-red-50 text-error',
  neutral: 'bg-slate-100 text-muted',
  info: 'bg-accent text-primary',
};

export function Badge({ tone = 'neutral', children }: { tone?: Tone; children: string }) {
  return (
    <span
      className={`inline-flex min-h-8 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium ${tones[tone]}`}
    >
      <span className="size-1.5 rounded-full bg-current" aria-hidden />
      {children}
    </span>
  );
}
