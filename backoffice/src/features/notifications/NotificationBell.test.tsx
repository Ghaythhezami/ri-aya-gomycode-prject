import '@testing-library/jest-dom';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import type { NotificationDto } from '@riaya/shared';
import i18n from '../../i18n';
import { RealtimeContext } from '../../lib/realtime';
import { NotificationBell } from './NotificationBell';

const mk = (id: string, over: Partial<NotificationDto> = {}): NotificationDto => ({
  id,
  category: 'REMINDER',
  titleKey: 'notifications.templates.reminder.title',
  bodyKey: 'notifications.templates.reminder.body',
  params: { patient: 'Sara', doctor: 'Dr. Kim', time: '2026-11-06T09:30:00Z' },
  entityType: 'appointment',
  entityId: 'a1',
  read: false,
  createdAt: new Date().toISOString(),
  ...over,
});

const items = Array.from({ length: 8 }, (_, i) => mk(`n${i}`, { read: i > 0 }));
let created: ((n: NotificationDto) => void) | undefined;

jest.mock('../shared/format', () => ({
  useClinicFormat: () => ({
    locale: 'en',
    time: () => '09:30',
    dateTime: () => 'today 09:30',
    shortDate: () => 'Nov 6',
  }),
}));
jest.mock('./api', () => ({
  useNotificationsListQuery: () => ({
    data: { items, nextCursor: null, unreadCount: 1 },
    isLoading: false,
    isError: false,
    refetch: jest.fn(),
  }),
  useUnreadNotificationCountQuery: () => ({ data: { count: 1 } }),
  useMarkNotificationReadMutation: () => [jest.fn()],
  useMarkAllNotificationsReadMutation: () => [jest.fn(), { isLoading: false }],
}));
jest.mock('./useNotificationRealtimeSync', () => ({
  useNotificationRealtimeSync: (onCreated: (n: NotificationDto) => void) => {
    created = onCreated;
  },
}));

beforeAll(async () => {
  await i18n.changeLanguage('en');
  window.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

function renderBell(status: 'connected' | 'offline' = 'connected') {
  return render(
    <RealtimeContext.Provider value={{ status, subscribe: () => () => undefined }}>
      <MemoryRouter>
        <NotificationBell />
      </MemoryRouter>
    </RealtimeContext.Provider>,
  );
}

describe('NotificationBell', () => {
  it('shows the live unread count and announces it politely', () => {
    renderBell();
    expect(screen.getByRole('button', { name: /1 unread/i })).toBeInTheDocument();
    const live = screen.getByText('1 unread notifications');
    expect(live).toHaveAttribute('aria-live', 'polite');
  });

  it('lists the latest six with an unread marker, category text and mark all read', async () => {
    renderBell();
    await userEvent.click(screen.getByRole('button', { name: /1 unread/i }));
    expect(screen.getAllByRole('listitem')).toHaveLength(6);
    expect(screen.getAllByText(/Reminder ·/)).toHaveLength(6);
    expect(screen.getByText('Unread:')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Mark all as read' })).toBeEnabled();
    expect(screen.getByRole('link', { name: 'View all notifications' })).toHaveAttribute(
      'href',
      '/notifications',
    );
  });

  it('toasts a new conflict with an action but ignores a routine reminder', () => {
    renderBell();
    act(() => created?.(mk('r1')));
    expect(screen.queryByRole('link', { name: 'View' })).not.toBeInTheDocument();
    act(() => created?.(mk('c1', { category: 'CONFLICT' })));
    expect(screen.getByRole('link', { name: 'View' })).toHaveAttribute('href', '/appointments/a1');
  });
});
