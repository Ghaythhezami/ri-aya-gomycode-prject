import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react';

const GAP = 8;
const MARGIN = 8;

type Side = 'top' | 'bottom';
type Align = 'start' | 'end';

/**
 * Anchored panel that never leaves the viewport (EC-009).
 *
 * On open — and again on resize, scroll or a size change of either element — the
 * preferred placement is measured against the window and flipped vertically or
 * shifted along the cross axis until it fits. `position: fixed` with measured
 * coordinates is used rather than CSS-only anchoring so a panel opened near any
 * edge still stays fully visible.
 *
 * Closing because the user clicked outside or pressed Escape does not restore
 * focus, because that would yank it away from whatever they just clicked.
 */
export function Popover({
  trigger,
  children,
  preferredSide = 'bottom',
  preferredAlign = 'start',
  label,
  panelClassName = 'w-72 p-3',
}: {
  /** Render function so the trigger can reflect the open state. */
  trigger: (state: {
    open: boolean;
    toggle: () => void;
    ref: RefObject<HTMLButtonElement | null>;
  }) => ReactNode;
  children: ReactNode;
  preferredSide?: Side;
  preferredAlign?: Align;
  label?: string;
  /** Width and padding of the panel (default `w-72 p-3`). */
  panelClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<{ top: number; left: number; side: Side }>({
    top: 0,
    left: 0,
    side: preferredSide,
  });

  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const place = useCallback(() => {
    const anchor = triggerRef.current?.getBoundingClientRect();
    const panel = panelRef.current?.getBoundingClientRect();
    if (!anchor || !panel) return;

    const viewportW = window.innerWidth;
    const viewportH = window.innerHeight;

    // Vertical: prefer the requested side, flip when it does not fit, then clamp.
    let side: Side = preferredSide;
    const spaceBelow = viewportH - anchor.bottom - GAP;
    const spaceAbove = anchor.top - GAP;
    if (preferredSide === 'bottom' && panel.height > spaceBelow && spaceAbove > spaceBelow) {
      side = 'top';
    } else if (preferredSide === 'top' && panel.height > spaceAbove && spaceBelow > spaceAbove) {
      side = 'bottom';
    }

    const rawTop = side === 'bottom' ? anchor.bottom + GAP : anchor.top - panel.height - GAP;
    const top = Math.min(Math.max(rawTop, MARGIN), viewportH - panel.height - MARGIN);

    // Horizontal: align to the chosen edge, then keep the whole panel on screen.
    const rawLeft = preferredAlign === 'start' ? anchor.left : anchor.right - panel.width;
    const left = Math.min(Math.max(rawLeft, MARGIN), viewportW - panel.width - MARGIN);

    setPosition({ top, left, side });
  }, [preferredSide, preferredAlign]);

  useLayoutEffect(() => {
    if (open) place();
  }, [open, place]);

  useEffect(() => {
    if (!open) return;

    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (triggerRef.current?.contains(target) || panelRef.current?.contains(target)) return;
      setOpen(false);
    };

    window.addEventListener('keydown', onKey);
    window.addEventListener('mousedown', onPointerDown);
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);

    // Re-place when either element changes size, e.g. content loading in.
    const observer = new ResizeObserver(place);
    if (panelRef.current) observer.observe(panelRef.current);
    if (triggerRef.current) observer.observe(triggerRef.current);

    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('mousedown', onPointerDown);
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
      observer.disconnect();
    };
  }, [open, place]);

  const toggle = useCallback(() => setOpen((value) => !value), []);

  return (
    <>
      {trigger({ open, toggle, ref: triggerRef })}
      {open ? (
        <div
          ref={panelRef}
          role="dialog"
          aria-label={label}
          style={{ position: 'fixed', top: position.top, left: position.left }}
          className={`z-40 rounded-md border border-border bg-surface shadow-(--shadow-overlay) ${panelClassName}`}
          data-side={position.side}
        >
          {children}
        </div>
      ) : null}
    </>
  );
}
