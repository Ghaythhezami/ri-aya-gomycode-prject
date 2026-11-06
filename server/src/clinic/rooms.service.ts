import { Injectable, UnprocessableEntityException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { RoomDto } from '@riaya/shared';
import { PrismaService } from '../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { TenantContext } from '../tenancy/tenant-context';
import { ClinicReferenceService, toRoomDto } from './clinic-reference.service';
import type { CreateRoomDto } from './dto/create-room.dto';

@Injectable()
export class RoomsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContext,
    private readonly audit: AuditService,
    private readonly reference: ClinicReferenceService,
  ) {}

  async list(): Promise<RoomDto[]> {
    const { clinicId } = this.tenant.get();
    const rooms = await this.prisma.room.findMany({
      where: { clinicId },
      orderBy: { name: 'asc' },
    });
    return rooms.map(toRoomDto);
  }

  async create(dto: CreateRoomDto): Promise<RoomDto> {
    const scope = this.tenant.get();
    try {
      const room = await this.prisma.$transactionWith(async (tx) => {
        const created = await tx.room.create({
          data: {
            clinicId: scope.clinicId,
            name: dto.name.trim(),
            kind: dto.kind ?? 'CONSULTATION',
          },
        });
        await this.audit.record(tx, {
          actorUserId: scope.userId,
          action: 'create',
          entity: 'room',
          entityId: created.id,
          after: toRoomDto(created),
        });
        return created;
      });
      await this.reference.invalidate(scope.clinicId);
      return toRoomDto(room);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new UnprocessableEntityException({
          code: 'VALIDATION_FAILED',
          message: 'A room with this name already exists',
          details: { field: 'name' },
        });
      }
      throw error;
    }
  }

  async specialties(): Promise<string[]> {
    const { clinicId } = this.tenant.get();
    const rows = await this.prisma.doctor.findMany({
      where: { clinicId, isActive: true },
      distinct: ['specialty'],
      select: { specialty: true },
      orderBy: { specialty: 'asc' },
    });
    return rows.map((r) => r.specialty);
  }
}
