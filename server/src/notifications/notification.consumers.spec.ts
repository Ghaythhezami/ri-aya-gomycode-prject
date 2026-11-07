import { NotificationConsumers } from './notification.consumers';

function build(patient: Record<string, unknown>) {
  const appointment = {
    id: 'ap-1',
    code: 'AP-1',
    startsAt: new Date(Date.now() + 72 * 3600_000),
    reminderChannels: ['SMS'],
    status: 'SCHEDULED',
    patient: { firstName: 'Ann', lastName: 'Lee', ...patient },
    doctor: { firstName: 'Who', lastName: 'Doc' },
  };
  const prisma = {
    appointment: { findFirst: jest.fn().mockResolvedValue(appointment) },
    reminderDelivery: { createMany: jest.fn().mockResolvedValue({ count: 1 }) },
  };
  const notifications = { create: jest.fn().mockResolvedValue(undefined) };
  const settings = {
    get: jest.fn().mockResolvedValue({ reminderChannels: ['SMS'], reminderOffsets: [1440] }),
  };
  const events = { on: jest.fn() };
  const consumers = new NotificationConsumers(
    events as never,
    prisma as never,
    notifications as never,
    settings as never,
  );
  return { consumers, prisma };
}

const created = (c: NotificationConsumers) =>
  (c as unknown as { onCreated: (e: unknown) => Promise<void> }).onCreated({
    clinicId: 'clinic-1',
    payload: { appointmentId: 'ap-1' },
    occurredAt: new Date(),
  });

describe('NotificationConsumers reminders and unverified portal patients', () => {
  it('skips reminders for a PORTAL patient whose account is unverified', async () => {
    const { consumers, prisma } = build({
      source: 'PORTAL',
      portalAccount: { emailVerifiedAt: null },
    });
    await created(consumers);
    expect(prisma.reminderDelivery.createMany).not.toHaveBeenCalled();
  });

  it('keeps reminders for staff-entered patients and for verified portal accounts', async () => {
    const staff = build({ source: 'STAFF', portalAccount: null });
    await created(staff.consumers);
    expect(staff.prisma.reminderDelivery.createMany).toHaveBeenCalledTimes(1);
    const verified = build({ source: 'PORTAL', portalAccount: { emailVerifiedAt: new Date() } });
    await created(verified.consumers);
    expect(verified.prisma.reminderDelivery.createMany).toHaveBeenCalledTimes(1);
  });
});
