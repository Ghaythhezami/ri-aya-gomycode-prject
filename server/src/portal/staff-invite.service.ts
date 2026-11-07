import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomBytes } from 'node:crypto';
import type { PatientPortalStatus, PortalInvite } from '@riaya/shared';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../database/prisma.service';
import { TenantContext } from '../tenancy/tenant-context';

export const INVITE_TTL_MS = 7 * 24 * 3600_000;

@Injectable()
export class StaffInviteService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContext,
    private readonly audit: AuditService,
    private readonly config: ConfigService,
  ) {}

  async invite(patientId: string): Promise<PortalInvite> {
    const scope = this.tenant.get();
    const patient = await this.prisma.patient.findFirst({
      where: { id: patientId, clinicId: scope.clinicId },
      select: { id: true, portalAccount: { select: { id: true } } },
    });
    if (!patient) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Patient not found' });
    }
    if (patient.portalAccount) {
      throw new ConflictException({
        code: 'ACCOUNT_EXISTS',
        message: 'This patient already has a portal account',
      });
    }
    const raw = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + INVITE_TTL_MS);
    await this.prisma.$transactionWith(async (tx) => {
      // A new invite revokes the patient's earlier open ones: only the latest link works.
      await tx.patientInvite.updateMany({
        where: { patientId: patient.id, clinicId: scope.clinicId, consumedAt: null },
        data: { consumedAt: new Date() },
      });
      const invite = await tx.patientInvite.create({
        data: {
          clinicId: scope.clinicId,
          patientId: patient.id,
          tokenHash: createHash('sha256').update(raw).digest('hex'),
          expiresAt,
          createdById: scope.userId,
        },
      });
      await this.audit.record(tx, {
        actorUserId: scope.userId,
        action: 'create',
        entity: 'patient_invite',
        entityId: invite.id,
        after: { patientId: patient.id, expiresAt: expiresAt.toISOString() },
      });
    });
    const base = this.config.get<string>('BACKOFFICE_URL') ?? 'http://localhost:5174';
    return {
      // Fragment, not query: it never reaches server logs, proxies or the Referer header.
      url: `${base}/portal/invite#token=${raw}`,
      expiresAt: expiresAt.toISOString(),
    };
  }

  private async patientWithAccount(patientId: string) {
    const scope = this.tenant.get();
    const patient = await this.prisma.patient.findFirst({
      where: { id: patientId, clinicId: scope.clinicId },
      select: {
        id: true,
        source: true,
        possibleDuplicateOfId: true,
        portalAccount: {
          select: { id: true, email: true, createdAt: true, emailVerifiedAt: true },
        },
      },
    });
    if (!patient) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Patient not found' });
    }
    return { scope, patient };
  }

  /** Portal status of a patient for the profile screen. */
  async status(patientId: string): Promise<PatientPortalStatus> {
    const { patient } = await this.patientWithAccount(patientId);
    const account = patient.portalAccount;
    return {
      hasAccount: account !== null,
      verified: !!account?.emailVerifiedAt,
      email: account?.email ?? null,
      createdAt: account?.createdAt.toISOString() ?? null,
      source: patient.source === 'PORTAL' ? 'PORTAL' : 'STAFF',
      possibleDuplicateOfId: patient.possibleDuplicateOfId ?? null,
    };
  }

  /**
   * Staff confirm the identity of the portal account (ID checked at the desk). Reuses
   * `PatientAccount.emailVerifiedAt` as the "verified by the clinic" timestamp.
   */
  async verify(patientId: string): Promise<PatientPortalStatus> {
    const { scope, patient } = await this.patientWithAccount(patientId);
    const account = patient.portalAccount;
    if (!account) {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: 'This patient has no portal account',
      });
    }
    if (!account.emailVerifiedAt) {
      await this.prisma.$transactionWith(async (tx) => {
        await tx.patientAccount.update({
          where: { id: account.id },
          data: { emailVerifiedAt: new Date() },
        });
        await this.audit.record(tx, {
          actorUserId: scope.userId,
          action: 'update',
          entity: 'patient_account',
          entityId: account.id,
          after: { patientId: patient.id, verifiedByStaff: true },
        });
      });
    }
    return this.status(patientId);
  }
}
