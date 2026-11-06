import { BadRequestException } from '@nestjs/common';
import { ChatService } from './chat.service';
import type { ServiceClient } from '../services/service-client';

const people = [
  { id: 'u1', firstName: 'Amel', lastName: 'Ben Ali' },
  { id: 'u2', firstName: 'Karim', lastName: 'Haddad' },
];

function setup(response: unknown, activeMembers = 2) {
  const request = jest.fn(async () => response);
  const comms = { enabled: true, request } as unknown as ServiceClient;
  const prisma = {
    user: { findMany: jest.fn(async () => people) },
    userMembership: { count: jest.fn(async () => activeMembers) },
    chatConversation: { findMany: jest.fn(), create: jest.fn() },
    chatMessage: { create: jest.fn() },
  };
  return { service: new ChatService(prisma as never, comms), request, prisma };
}

describe('ChatService with riaya-comms (ADR 0003)', () => {
  it('lists conversations from the service and resolves names locally', async () => {
    const { service, request } = setup([
      {
        id: 'c1',
        title: null,
        isGroup: false,
        memberIds: ['u1', 'u2'],
        lastMessage: { body: 'hi', createdAt: '2026-11-06T09:00:00.000Z', senderId: 'u2' },
        unreadCount: 3,
        createdAt: '2026-11-06T08:00:00.000Z',
        updatedAt: '2026-11-06T09:00:00.000Z',
      },
    ]);
    const list = await service.list('clinic-1', 'u1');
    expect(request).toHaveBeenCalledWith(
      expect.objectContaining({
        path: '/v1/conversations',
        principal: { clinicId: 'clinic-1', userId: 'u1', role: 'STAFF' },
      }),
    );
    expect(list[0]).toMatchObject({ id: 'c1', unread: 3, members: [{ id: 'u1' }, { id: 'u2' }] });
    expect(list[0].title).toContain('Karim');
  });

  it('checks active clinic membership before creating a conversation in the service', async () => {
    const { service, request } = setup({}, 1);
    await expect(
      service.create('clinic-1', 'u1', { memberIds: ['u-other-clinic'] }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(request).not.toHaveBeenCalled();
  });

  it('validates the body before posting and maps the stored message', async () => {
    const { service, request, prisma } = setup({
      id: 'm1',
      conversationId: 'c1',
      senderId: 'u1',
      body: 'Bonjour',
      readBy: ['u1'],
      readByOthers: false,
      createdAt: '2026-11-06T09:00:00.000Z',
    });
    await expect(service.post('clinic-1', 'u1', 'c1', '   ')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    const message = await service.post('clinic-1', 'u1', 'c1', '  Bonjour ');
    expect(request).toHaveBeenCalledWith(
      expect.objectContaining({ path: '/v1/conversations/c1/messages', body: { body: 'Bonjour' } }),
    );
    expect(message).toMatchObject({ id: 'm1', body: 'Bonjour', sender: { id: 'u1' } });
    expect(prisma.chatMessage.create).not.toHaveBeenCalled();
  });
});
