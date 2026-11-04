import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';

export interface MenuItem {
  id: string;
  label: string;
  onSelect: () => void;
  /** Renders the item in the error tone; still fully operable. */
  tone?: 'default' | 'danger';
  icon?: ReactNode;
}

/**
 * Disclosure menu following the WAI-ARIA menu-button pattern (NFR-004).
 *
 * Arrow keys move focus among items, Home/End jump to the ends, Escape closes
 * and returns focus to the trigger, and Tab (or a click outside) closes without
 * trapping the user. Items are rendered only while open, so their focus order
 * never pollutes the page's tab sequence.
 */
export function Dropdown({
  label,
  trigger,
  items,
  align = 'end',
}: {
  /** Accessible name for the trigger when it is icon-only. */
  label?: string;
  trigger: ReactNode;
  items: MenuItem[];
  align?: 'start' | 'end';
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const listId = useId();

  useEffect(() => {
    if (!open) return;
    // Focus the first item so keyboard users land inside the menu.
    itemRefs.current[0]?.focus();

    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (triggerRef.current?.contains(target)) return;
      if (itemRefs.current.some((node) => node?.contains(target))) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [open]);

  const close = (returnFocus: boolean) => {
    setOpen(false);
    if (returnFocus) triggerRef.current?.focus();
  };

  const focusItem = (index: number) => {
    const node = itemRefs.current[(index + items.length) % items.length];
    node?.focus();
  };

  const onListKeyDown = (event: KeyboardEvent<HTMLUListElement>) => {
    const current = itemRefs.current.findIndex((node) => node === document.activeElement);
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        focusItem(current + 1);
        break;
      case 'ArrowUp':
        event.preventDefault();
        focusItem(current - 1);
        break;
      case 'Home':
        event.preventDefault();
        focusItem(0);
        break;
      case 'End':
        event.preventDefault();
        focusItem(items.length - 1);
        break;
      case 'Escape':
        event.preventDefault();
        close(true);
        break;
      case 'Tab':
        close(false);
        break;
      default:
        break;
    }
  };

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-label={label}
        className="flex min-h-10 items-center gap-2 rounded-md border border-border bg-surface px-3 text-sm text-text"
        onClick={() => setOpen((value) => !value)}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') {
            if (!open) {
              event.preventDefault();
              setOpen(true);
            }
          }
        }}
      >
        {trigger}
      </button>
      {open ? (
        <ul
          id={listId}
          role="menu"
          aria-label={label}
          className={`absolute z-20 mt-1 w-56 rounded-md border border-border bg-surface p-1 shadow-(--shadow-card) ${
            align === 'end' ? 'end-0' : 'start-0'
          }`}
          onKeyDown={onListKeyDown}
        >
          {items.map((item, index) => (
            <li key={item.id} role="none">
              <button
                ref={(node) => {
                  itemRefs.current[index] = node;
                }}
                type="button"
                role="menuitem"
                className={`flex min-h-10 w-full items-center gap-2 rounded-lg px-2 text-sm ${
                  item.tone === 'danger' ? 'text-error' : 'text-text'
                } hover:bg-bg`}
                onClick={() => {
                  close(true);
                  item.onSelect();
                }}
              >
                {item.icon}
                {item.label}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
