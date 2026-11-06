import { Component, type ErrorInfo, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { TriangleAlert } from 'lucide-react';
import { Button } from '../common/Button';

function Fallback({ onRetry }: { onRetry: () => void }) {
  const { t } = useTranslation();
  return (
    <div
      role="alert"
      className="mx-auto mt-10 flex max-w-md flex-col items-center rounded-lg border border-border bg-surface px-6 py-10 text-center shadow-(--shadow-card)"
    >
      <span
        aria-hidden="true"
        className="grid size-12 place-items-center rounded-full bg-error/10 text-error"
      >
        <TriangleAlert size={22} />
      </span>
      <h2 className="mt-4 text-lg font-semibold text-text">{t('shellnav.errorTitle')}</h2>
      <p className="mt-1 text-sm text-muted">{t('shellnav.errorBody')}</p>
      <div className="mt-5 flex flex-wrap justify-center gap-2">
        <Button onClick={onRetry}>{t('clinic.retry')}</Button>
        <Button variant="secondary" onClick={() => window.location.reload()}>
          {t('shellnav.reload')}
        </Button>
      </div>
    </div>
  );
}

interface Props {
  children: ReactNode;
  /** A change of this value (the route) clears a previous error. */
  resetKey?: string;
}

/** Global error boundary around the routed page: a friendly state with retry. */
export class ErrorBoundary extends Component<Props, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Unhandled UI error', error, info.componentStack);
  }

  componentDidUpdate(previous: Props) {
    if (this.state.failed && previous.resetKey !== this.props.resetKey) {
      this.setState({ failed: false });
    }
  }

  render() {
    if (this.state.failed) return <Fallback onRetry={() => this.setState({ failed: false })} />;
    return this.props.children;
  }
}
