import { useId, useState, type ReactNode } from 'react';

/**
 * Tooltip shown on hover *and* focus (WCAG 1.4.13 / NFR-004).
 *
 * The trigger owns `aria-describedby` pointing at the bubble, so the hint is
 * announced without stealing the control's accessible name. Escape dismisses it
 * while keeping focus, which 1.4.13 requires for keyboard users.
 */
export function Tooltip({ content, children }: { content: string; children: ReactNode }) {
  const id = useId();
  const [visible, setVisible] = useState(false);

  return (
    <span
      className="relative inline-flex"
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
      onFocus={() => setVisible(true)}
      onBlur={() => setVisible(false)}
      onKeyDown={(event) => {
        if (event.key === 'Escape') setVisible(false);
      }}
      aria-describedby={visible ? id : undefined}
    >
      {children}
      {visible ? (
        <span
          role="tooltip"
          id={id}
          className="absolute bottom-full start-1/2 z-30 mb-2 w-max max-w-xs -translate-x-1/2 rounded-md bg-navy px-2 py-1 text-xs text-white shadow-(--shadow-overlay) rtl:translate-x-1/2"
        >
          {content}
        </span>
      ) : null}
    </span>
  );
}
