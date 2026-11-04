import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';

export interface Option {
  value: string;
  label: string;
}

export interface SearchableSelectProps {
  options: Option[];
  value: string | null;
  onChange: (value: string) => void;
  label?: string;
  placeholder?: string;
  /** Shown when the query matches nothing. */
  noResultsLabel?: string;
  id?: string;
}

/**
 * Combobox (WAI-ARIA APG) with type-ahead filtering.
 *
 * The text input owns `aria-activedescendant`, so focus never leaves it while
 * arrowing through options — that keeps screen-reader and keyboard behaviour on
 * one predictable element. Escape and Tab close the list; Enter selects.
 */
export function SearchableSelect({
  options,
  value,
  onChange,
  label,
  placeholder = '',
  noResultsLabel = 'No results',
  id,
}: SearchableSelectProps) {
  const reactId = useId();
  const listId = `${id ?? reactId}-listbox`;
  const inputRef = useRef<HTMLInputElement>(null);

  const selected = options.find((option) => option.value === value) ?? null;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);

  const needle = query.trim().toLowerCase();
  const filtered = needle
    ? options.filter((option) => option.label.toLowerCase().includes(needle))
    : options;

  // Clamp the active option whenever the filtered list shrinks.
  useEffect(() => {
    setActive((current) =>
      current >= filtered.length ? Math.max(0, filtered.length - 1) : current,
    );
  }, [filtered.length]);

  const close = () => {
    setOpen(false);
    setQuery('');
  };

  const choose = (option: Option) => {
    onChange(option.value);
    close();
    inputRef.current?.focus();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!open) {
        setOpen(true);
        setActive(0);
        return;
      }
      const delta = event.key === 'ArrowDown' ? 1 : -1;
      setActive((current) => {
        if (filtered.length === 0) return 0;
        return (current + delta + filtered.length) % filtered.length;
      });
      return;
    }
    if (event.key === 'Enter' && open) {
      event.preventDefault();
      const option = filtered[active];
      if (option) choose(option);
      return;
    }
    if (event.key === 'Escape' && open) {
      event.preventDefault();
      close();
    }
  };

  return (
    <div className="block">
      {label ? (
        <label htmlFor={id ?? reactId} className="mb-1.5 block text-sm font-medium text-text">
          {label}
        </label>
      ) : null}
      <div className="relative">
        <input
          ref={inputRef}
          id={id ?? reactId}
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={open && filtered[active] ? `${listId}-${active}` : undefined}
          autoComplete="off"
          className="min-h-10 w-full rounded-md border border-border-strong bg-surface px-3 pe-9 text-text placeholder:text-muted"
          placeholder={open || !selected ? placeholder : selected.label}
          value={open ? query : (selected?.label ?? '')}
          onChange={(event) => {
            setQuery(event.target.value);
            setActive(0);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={close}
          onKeyDown={onKeyDown}
        />
        <span
          aria-hidden
          className="pointer-events-none absolute inset-y-0 end-3 grid place-items-center text-muted"
        >
          ▾
        </span>
        {open ? (
          <ul
            id={listId}
            role="listbox"
            className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-md border border-border bg-surface py-1 shadow-(--shadow-card)"
          >
            {filtered.length === 0 ? (
              <li className="px-3 py-2 text-sm text-muted">{noResultsLabel}</li>
            ) : (
              filtered.map((option, index) => (
                <li
                  key={option.value}
                  id={`${listId}-${index}`}
                  role="option"
                  aria-selected={option.value === value}
                  className={`min-h-10 cursor-pointer px-3 py-2 text-sm ${
                    index === active ? 'bg-accent text-primary' : 'text-text'
                  }`}
                  // mousedown precedes blur, so the click lands before close() runs.
                  onMouseDown={(event) => {
                    event.preventDefault();
                    choose(option);
                  }}
                  onMouseEnter={() => setActive(index)}
                >
                  {option.label}
                </li>
              ))
            )}
          </ul>
        ) : null}
      </div>
    </div>
  );
}
