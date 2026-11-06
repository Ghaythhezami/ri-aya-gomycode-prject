/** Initials avatar (no photos of real people in a demo with fictional data). */
export function Avatar({ initials, size = 'md' }: { initials: string; size?: 'sm' | 'md' | 'lg' }) {
  const sizes = { sm: 'size-7 text-[11px]', md: 'size-9 text-xs', lg: 'size-12 text-sm' };
  return (
    <span
      aria-hidden="true"
      className={`inline-flex shrink-0 items-center justify-center rounded-full bg-accent font-semibold text-primary ${sizes[size]}`}
    >
      {initials}
    </span>
  );
}
