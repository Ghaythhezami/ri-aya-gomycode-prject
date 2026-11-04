type Tone = 'success' | 'warning' | 'error' | 'neutral' | 'info';

/** Tinted with the token colour at low opacity, so a badge never needs its own pale hex. */
const tones: Record<Tone, string> = {
  success: 'bg-success/10 text-success',
  warning: 'bg-warning/10 text-warning',
  error: 'bg-error/10 text-error',
  neutral: 'bg-muted/10 text-muted',
  info: 'bg-accent text-primary',
};

/**
 * Each tone pairs its colour with a distinct glyph and a visually hidden tone
 * word, so status is never conveyed by colour alone (WCAG 1.4.1 / NFR-004).
 */
const indicators: Record<Tone, { glyph: string; srLabel: string }> = {
  success: { glyph: '✓', srLabel: 'Positive:' },
  warning: { glyph: '!', srLabel: 'Caution:' },
  error: { glyph: '✕', srLabel: 'Problem:' },
  neutral: { glyph: '•', srLabel: 'Note:' },
  info: { glyph: 'i', srLabel: 'Info:' },
};

export function Badge({ tone = 'neutral', children }: { tone?: Tone; children: string }) {
  const { glyph, srLabel } = indicators[tone];
  return (
    <span
      className={`inline-flex min-h-8 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium ${tones[tone]}`}
    >
      <span aria-hidden className="text-xs leading-none">
        {glyph}
      </span>
      <span className="sr-only">{srLabel} </span>
      {children}
    </span>
  );
}
