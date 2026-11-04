import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

type Tone = 'success' | 'error' | 'info';

interface ToastItem {
  id: number;
  tone: Tone;
  message: string;
}

interface ToastApi {
  success: (message: string) => void;
  error: (message: string) => void;
  info: (message: string) => void;
  dismiss: (id: number) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

const tones: Record<Tone, { className: string; glyph: string }> = {
  success: { className: 'border-success/40 bg-success/10 text-success', glyph: '✓' },
  error: { className: 'border-error/40 bg-error/10 text-error', glyph: '✕' },
  info: { className: 'border-border bg-surface text-text', glyph: 'i' },
};

/** How long a toast stays up before auto-dismissing. */
const TIMEOUT_MS = 5000;

/**
 * Toast host (FR-006).
 *
 * Each toast is a polite live region announced when it appears. Errors use
 * `role="alert"` so they interrupt, matching their urgency; the rest wait for a
 * natural pause. Dismiss buttons are real buttons, so a toast can be cleared
 * without waiting for the timer.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(0);

  const dismiss = useCallback((id: number) => {
    setItems((current) => current.filter((item) => item.id !== id));
  }, []);

  const push = useCallback(
    (tone: Tone, message: string) => {
      const id = nextId.current++;
      setItems((current) => [...current, { id, tone, message }]);
      window.setTimeout(() => dismiss(id), TIMEOUT_MS);
    },
    [dismiss],
  );

  const api = useMemo<ToastApi>(
    () => ({
      success: (message) => push('success', message),
      error: (message) => push('error', message),
      info: (message) => push('info', message),
      dismiss,
    }),
    [push, dismiss],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex flex-col items-center gap-2 px-4">
        {items.map((item) => {
          const { className, glyph } = tones[item.tone];
          return (
            <div
              key={item.id}
              role={item.tone === 'error' ? 'alert' : 'status'}
              aria-live={item.tone === 'error' ? 'assertive' : 'polite'}
              className={`pointer-events-auto flex w-full max-w-md items-start gap-2 rounded-md border px-3 py-2 text-sm shadow-(--shadow-card) ${className}`}
            >
              <span aria-hidden className="mt-0.5">
                {glyph}
              </span>
              <span className="flex-1">{item.message}</span>
              <button
                type="button"
                aria-label="Dismiss"
                className="grid size-10 place-items-center rounded-md text-current"
                onClick={() => dismiss(item.id)}
              >
                <span aria-hidden>✕</span>
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used inside <ToastProvider>');
  return context;
}
