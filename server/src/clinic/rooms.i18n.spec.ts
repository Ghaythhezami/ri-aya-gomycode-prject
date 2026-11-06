import { RequestLocale } from '../common/locale/request-locale';
import { RoomsService } from './rooms.service';
import { toRoomDto } from './clinic-reference.service';

describe('rooms localization', () => {
  it('returns the localized displayName and the full nameI18n', () => {
    const room = {
      id: 'r1',
      name: 'Room 1',
      nameI18n: { en: 'Room 1', fr: 'Salle 1', ar: 'غرفة 1' },
      kind: 'CONSULTATION',
      isActive: true,
    };
    expect(toRoomDto(room).name).toBe('Room 1');
    RequestLocale.run('ar', () => {
      expect(toRoomDto(room)).toMatchObject({ name: 'غرفة 1', nameI18n: room.nameI18n });
    });
    RequestLocale.run('fr', () => expect(toRoomDto(room).name).toBe('Salle 1'));
  });

  it('derives the canonical name from nameI18n on create', async () => {
    const created: Record<string, unknown>[] = [];
    const tx = {
      room: {
        create: ({ data }: { data: Record<string, unknown> }) => {
          created.push(data);
          return Promise.resolve({ id: 'r', isActive: true, kind: 'CONSULTATION', ...data });
        },
      },
    };
    const prisma = { $transactionWith: (fn: (t: typeof tx) => unknown) => fn(tx) };
    const service = new RoomsService(
      prisma as never,
      { get: () => ({ clinicId: 'c', userId: 'u' }) } as never,
      { record: () => Promise.resolve() } as never,
      { invalidate: () => Promise.resolve() } as never,
      { get: () => Promise.resolve({ defaultLanguage: 'ar' }) } as never,
    );
    const room = await service.create({ nameI18n: { en: 'Imaging', ar: 'التصوير' } });
    expect(created[0]).toMatchObject({
      name: 'التصوير',
      nameI18n: { en: 'Imaging', ar: 'التصوير' },
    });
    expect(room.nameI18n).toEqual({ en: 'Imaging', ar: 'التصوير' });
  });
});
