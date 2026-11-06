import { DoctorsController } from './doctors.controller';

function build(caps: string[], ownDoctorId: string | null) {
  const doctors = {
    ownDoctorId: jest.fn(async () => ownDoctorId),
    putWorkingHours: jest.fn(async () => ({ ok: true })),
    addLeave: jest.fn(async () => ({ ok: true })),
    removeLeave: jest.fn(async () => ({ ok: true })),
  };
  const rbac = { has: jest.fn(async (_scope: unknown, cap: string) => caps.includes(cap)) };
  const tenant = { get: () => ({ clinicId: 'c1', userId: 'u1', role: 'DOCTOR' }) };
  const controller = new DoctorsController(doctors as never, rbac as never, tenant as never);
  return { controller, doctors };
}

describe('doctor schedule edits use capabilities, not the base role', () => {
  it('allows manageDoctors for any doctor', async () => {
    const { controller, doctors } = build(['manageDoctors'], null);
    await controller.putWorkingHours('d1', {} as never);
    expect(doctors.putWorkingHours).toHaveBeenCalled();
  });

  it('allows viewScheduling only on the caller own doctor profile', async () => {
    const own = build(['viewScheduling'], 'd1');
    await expect(own.controller.addLeave('d1', {} as never)).resolves.toBeDefined();
    await expect(own.controller.addLeave('d2', {} as never)).rejects.toMatchObject({ status: 403 });
  });

  it('denies a DOCTOR-based role without the capabilities', async () => {
    const { controller, doctors } = build([], 'd1');
    await expect(controller.putWorkingHours('d1', {} as never)).rejects.toMatchObject({
      status: 403,
    });
    await expect(controller.removeLeave('d1', 'l1')).rejects.toMatchObject({ status: 403 });
    expect(doctors.putWorkingHours).not.toHaveBeenCalled();
  });
});
