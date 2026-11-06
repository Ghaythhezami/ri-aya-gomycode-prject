import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { Loader2, Search } from 'lucide-react';

export interface SearchOption {
  id: string;
  kind: 'patient' | 'appointment';
  title: string;
  subtitle: string;
  /** Accessible name, e.g. "Patient: Sarah Johnson". */
  label: string;
}

export interface SearchComboboxLabels {
  input: string;
  placeholder: string;
  empty: string;
  error: string;
  groups: Record<SearchOption['kind'], string>;
  loading: string;
}

/**
 * Search box with a listbox of results (WAI-ARIA combobox, list autocomplete).
 *
 * Focus stays in the input; ArrowUp/ArrowDown move the active option
 * (`aria-activedescendant`), Home/End jump, Enter opens the active option, Escape
 * closes the list (a second Escape clears the text). Presentational: the owner
 * debounces the query and supplies the options, which keeps it testable without
 * the API.
 */
export function SearchCombobox({
  query,
  onQueryChange,
  options,
  loading,
  failed,
  labels,
  onSelect,
  minLength = 2,
}: {
  query: string;
  onQueryChange: (value: string) => void;
  options: SearchOption[];
  loading: boolean;
  failed: boolean;
  labels: SearchComboboxLabels;
  onSelect: (option: SearchOption) => void;
  minLength?: number;
}) {
  const reactId = useId();
  const listId = `${reactId}-list`;
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);

  const ready = query.trim().length >= minLength;
  const expanded = open && ready;

  useEffect(() => {
    setActive(0);
  }, [options]);

  useEffect(() => {
    listRef.current
      ?.querySelector('[aria-selected="true"]')
      ?.scrollIntoView?.({ block: 'nearest' });
  }, [active, expanded]);

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        if (!expanded) {
          setOpen(true);
          return;
        }
        if (options.length) setActive((value) => (value + 1) % options.length);
        break;
      case 'ArrowUp':
        event.preventDefault();
        if (options.length) setActive((value) => (value - 1 + options.length) % options.length);
        break;
      case 'Home':
        if (expanded && options.length) {
          event.preventDefault();
          setActive(0);
        }
        break;
      case 'End':
        if (expanded && options.length) {
          event.preventDefault();
          setActive(options.length - 1);
        }
        break;
      case 'Enter': {
        const option = options[active];
        if (expanded && option) {
          event.preventDefault();
          choose(option);
        }
        break;
      }
      case 'Escape':
        if (expanded) {
          event.preventDefault();
          setOpen(false);
        } else if (query) {
          event.preventDefault();
          onQueryChange('');
        }
        break;
      default:
        break;
    }
  }

  function choose(option: SearchOption) {
    setOpen(false);
    onSelect(option);
  }

  return (
    <div className="relative w-full">
      <Search
        size={16}
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 start-4 my-auto text-muted"
      />
      <input
        role="combobox"
        type="search"
        autoComplete="off"
        aria-expanded={expanded}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={expanded && options[active] ? `${listId}-${active}` : undefined}
        aria-label={labels.input}
        placeholder={labels.placeholder}
        value={query}
        onChange={(event) => {
          onQueryChange(event.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={onKeyDown}
        className="min-h-11 w-full rounded-full border border-border bg-bg ps-10 pe-10 text-sm text-text placeholder:text-muted"
      />
      {loading && ready ? (
        <Loader2
          size={16}
          aria-hidden="true"
          className="absolute inset-y-0 end-4 my-auto animate-spin text-muted motion-reduce:animate-none"
        />
      ) : null}

      <div aria-live="polite" className="sr-only">
        {expanded && !loading
          ? failed
            ? labels.error
            : options.length === 0
              ? labels.empty
              : ''
          : ''}
      </div>

      {expanded ? (
        <div className="absolute inset-x-0 top-full z-30 mt-1 overflow-hidden rounded-md border border-border bg-surface shadow-(--shadow-overlay)">
          {options.length > 0 ? (
            <ul
              ref={listRef}
              id={listId}
              role="listbox"
              aria-label={labels.input}
              className="max-h-80 overflow-y-auto py-1"
            >
              {options.map((option, index) => {
                const firstOfKind = options.findIndex((o) => o.kind === option.kind) === index;
                return (
                  <li key={`${option.kind}-${option.id}`} role="presentation">
                    {firstOfKind ? (
                      <p
                        aria-hidden="true"
                        className="px-3 pb-1 pt-2 text-xs font-semibold uppercase tracking-wide text-muted"
                      >
                        {labels.groups[option.kind]}
                      </p>
                    ) : null}
                    <div
                      id={`${listId}-${index}`}
                      role="option"
                      aria-selected={index === active}
                      aria-label={option.label}
                      // mousedown fires before the input blurs, so the click is not lost.
                      onMouseDown={(event) => {
                        event.preventDefault();
                        choose(option);
                      }}
                      onMouseEnter={() => setActive(index)}
                      className={`min-h-11 cursor-pointer px-3 py-2 ${
                        index === active ? 'bg-accent' : ''
                      }`}
                    >
                      <p className="truncate text-sm font-medium text-text">{option.title}</p>
                      <p className="truncate text-xs text-muted">{option.subtitle}</p>
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p id={listId} role="status" className="px-3 py-4 text-sm text-muted">
              {loading ? labels.loading : failed ? labels.error : labels.empty}
            </p>
          )}
        </div>
      ) : null}
    </div>
  );
}
