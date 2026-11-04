import { useRef, type KeyboardEvent, type ReactNode } from 'react';

export interface TabItem {
  id: string;
  label: string;
  content: ReactNode;
  /** Optional badge/count rendered after the label. */
  count?: number;
}

/**
 * Tab set following the WAI-ARIA tabs pattern with a roving tabindex: only the
 * selected tab is in the tab order, and Arrow/Home/End move selection while
 * keeping focus on the tablist (NFR-004). Arrow direction is logical, so RTL
 * reads correctly without a separate code path.
 */
export function Tabs({
  tabs,
  value,
  onChange,
  label,
}: {
  tabs: TabItem[];
  value: string;
  onChange: (id: string) => void;
  /** Accessible name for the tablist. */
  label: string;
}) {
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});
  const activeIndex = Math.max(
    0,
    tabs.findIndex((tab) => tab.id === value),
  );
  const active = tabs[activeIndex];

  const focusTab = (index: number) => {
    const next = tabs[(index + tabs.length) % tabs.length];
    if (!next) return;
    onChange(next.id);
    refs.current[next.id]?.focus();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    switch (event.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        event.preventDefault();
        focusTab(activeIndex + 1);
        break;
      case 'ArrowLeft':
      case 'ArrowUp':
        event.preventDefault();
        focusTab(activeIndex - 1);
        break;
      case 'Home':
        event.preventDefault();
        focusTab(0);
        break;
      case 'End':
        event.preventDefault();
        focusTab(tabs.length - 1);
        break;
      default:
        break;
    }
  };

  return (
    <div>
      <div
        role="tablist"
        aria-label={label}
        className="flex gap-1 border-b border-border"
        onKeyDown={onKeyDown}
      >
        {tabs.map((tab) => {
          const selected = tab.id === active?.id;
          return (
            <button
              key={tab.id}
              ref={(node) => {
                refs.current[tab.id] = node;
              }}
              role="tab"
              id={`tab-${tab.id}`}
              aria-selected={selected}
              aria-controls={`panel-${tab.id}`}
              tabIndex={selected ? 0 : -1}
              type="button"
              className={`-mb-px min-h-10 rounded-t-md border-b-2 px-4 text-sm font-medium ${
                selected
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted hover:text-text'
              }`}
              onClick={() => onChange(tab.id)}
            >
              {tab.label}
              {typeof tab.count === 'number' ? (
                <span className="ms-1.5 rounded-full bg-bg px-1.5 text-xs text-muted">
                  {tab.count}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
      {tabs.map((tab) => (
        <div
          key={tab.id}
          role="tabpanel"
          id={`panel-${tab.id}`}
          aria-labelledby={`tab-${tab.id}`}
          hidden={tab.id !== active?.id}
          tabIndex={0}
          className="pt-4"
        >
          {tab.id === active?.id ? tab.content : null}
        </div>
      ))}
    </div>
  );
}
