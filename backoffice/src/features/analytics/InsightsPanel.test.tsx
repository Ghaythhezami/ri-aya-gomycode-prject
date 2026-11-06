import { fireEvent, render, screen } from '@testing-library/react';
import type { SchedulingInsights } from '@riaya/shared';
import i18n from '../../i18n';
import { InsightsPanel } from './InsightsPanel';

jest.mock('../shared/format', () => ({
  useClinicFormat: () => ({
    locale: 'en',
    number: (v: number) => String(v),
    shortDate: () => 'Nov 6',
  }),
}));

const useInsightsQuery = jest.fn();
jest.mock('./api', () => ({ useInsightsQuery: (...args: unknown[]) => useInsightsQuery(...args) }));

class RO {
  observe() {}
  unobserve() {}
  disconnect() {}
}

const matrix = Array.from({ length: 7 }, () => new Array<number>(24).fill(0));
matrix[3]![9] = 12;
matrix[0]![11] = 4;

const data: SchedulingInsights = {
  range: { from: '2026-10-01', to: '2026-10-31', timeZone: 'UTC' },
  totals: { appointments: 100, completed: 80, noShows: 10, cancelled: 10, noShowRate: 0.111 },
  demand: { matrix, peak: [] },
  noShow: {
    byWeekday: [{ key: '3', rate: 0.2, count: 30 }],
    byHour: [],
    byType: [],
    byLeadTime: [
      { key: '31d+', rate: 0.3, count: 5 },
      { key: '0-1d', rate: 0.05, count: 20 },
    ],
  },
  doctors: [],
  forecast: [{ date: '2026-11-07', expected: 12.4 }],
  recommendations: [
    { kind: 'HIGH_NO_SHOW_SLOT', params: { weekday: 3, hour: 9, rate: 0.21, count: 34 } },
  ],
  meta: { rowsScanned: 100, chunks: 1, durationMs: 42, engine: 'numpy' },
};

beforeAll(async () => {
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver = RO;
  await i18n.changeLanguage('en');
});
beforeEach(() => useInsightsQuery.mockReset());

const renderPanel = (organizationScope = false) =>
  render(<InsightsPanel from="2026-10-01" to="2026-10-31" organizationScope={organizationScope} />);

describe('InsightsPanel', () => {
  it('shows a skeleton while loading', () => {
    useInsightsQuery.mockReturnValue({ isLoading: true, isError: false });
    const { container } = renderPanel();
    expect(container.querySelector('[aria-busy="true"]')).not.toBeNull();
  });

  it('shows the unavailable state with a working retry on 503', () => {
    const refetch = jest.fn();
    useInsightsQuery.mockReturnValue({
      isLoading: false,
      isError: true,
      error: { status: 503, code: 'SERVICE_UNAVAILABLE', message: 'x' },
      refetch,
    });
    renderPanel();
    expect(screen.getByText('Insights are temporarily unavailable')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(refetch).toHaveBeenCalled();
  });

  it('shows the empty state when there are no appointments', () => {
    useInsightsQuery.mockReturnValue({
      isLoading: false,
      isError: false,
      data: { ...data, totals: { ...data.totals, appointments: 0 } },
    });
    renderPanel();
    expect(screen.getByText('No appointments to analyse')).toBeInTheDocument();
  });

  it('renders the heatmap cells, provenance, note and recommendation', () => {
    useInsightsQuery.mockReturnValue({ isLoading: false, isError: false, data });
    renderPanel(true);
    expect(screen.getByLabelText('Thursday 09:00, 12 bookings')).toBeInTheDocument();
    expect(screen.getByLabelText('Monday 11:00, 4 bookings')).toBeInTheDocument();
    // Hours outside the demand span are trimmed.
    expect(screen.queryByLabelText('Monday 08:00, 0 bookings')).not.toBeInTheDocument();
    expect(
      screen.getByText('Computed by the scheduling service over 100 appointments in 42 ms.'),
    ).toBeInTheDocument();
    expect(screen.getByText(/computed per clinic/)).toBeInTheDocument();
    expect(
      screen.getByText(/Thursday at 09:00 has a 21% no-show rate \(34 visits\)/),
    ).toBeInTheDocument();
  });
});
