/**
 * Loading placeholder. The pulse is suppressed under
 * `prefers-reduced-motion: reduce` (NFR-004), leaving a static block that still
 * reserves the right space so the layout does not jump when data arrives.
 */
export function Skeleton({
  className = '',
  lines = 1,
}: {
  className?: string;
  /** Renders a stack of text-shaped bars instead of a single block. */
  lines?: number;
}) {
  if (lines > 1) {
    return (
      <div className="space-y-2" aria-hidden>
        {Array.from({ length: lines }, (_, index) => (
          <div
            key={index}
            className="h-4 animate-pulse rounded-sm bg-bg motion-reduce:animate-none"
            style={{ width: `${100 - index * 12}%` }}
          />
        ))}
      </div>
    );
  }

  return (
    <div
      aria-hidden
      className={`animate-pulse rounded-md bg-bg motion-reduce:animate-none ${className}`}
    />
  );
}
