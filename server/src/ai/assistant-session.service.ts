import { Injectable } from '@nestjs/common';
import type { AssistantPersona, AssistantStatus } from '@riaya/shared';
import { personName } from '../common/mappers';
import { ClinicSettingsReader } from '../core/clinic-settings.reader';
import { PrismaService } from '../database/prisma.service';
import { RbacService } from '../rbac/rbac.service';
import type { TenantScope } from '../tenancy/tenant-context';
import type { UserRecord } from '../users/user.types';
import type { PortalPrincipal } from '../portal/auth/patient-context';
import { AiGuardRailsService } from './ai-guard-rails.service';
import { ACTOR_PATIENT, ACTOR_STAFF } from './ai.constants';
import type { ChatSession } from './assistant-engine.service';

/** Builds the caller (persona, capabilities, clinic zone) from the verified token. */
@Injectable()
export class AssistantSessionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rbac: RbacService,
    private readonly settings: ClinicSettingsReader,
    private readonly guard: AiGuardRailsService,
  ) {}

  /** doctor: base role DOCTOR, or clinical access plus scheduling and a linked doctor profile. */
  async staffPersona(scope: TenantScope): Promise<{
    persona: AssistantPersona;
    caps: Awaited<ReturnType<RbacService['capabilitiesFor']>>;
    doctorId: string | null;
  }> {
    const caps = await this.rbac.capabilitiesFor(scope);
    const profile = await this.prisma.doctor.findFirst({
      where: { clinicId: scope.clinicId, userId: scope.userId },
      select: { id: true },
    });
    const isDoctor =
      scope.role === 'DOCTOR' ||
      (caps.includes('readClinicalNotes') && caps.includes('viewScheduling') && !!profile);
    return { persona: isDoctor ? 'doctor' : 'staff', caps, doctorId: profile?.id ?? null };
  }

  async staffStatus(scope: TenantScope): Promise<AssistantStatus> {
    if (!this.guard.configured) return { enabled: false, persona: null, reason: 'NOT_CONFIGURED' };
    const { persona, caps } = await this.staffPersona(scope);
    if (!caps.includes('viewOverview'))
      return { enabled: false, persona: null, reason: 'FORBIDDEN' };
    if (!(await this.guard.clinicEnabled(scope.clinicId))) {
      return { enabled: false, persona: null, reason: 'DISABLED_BY_CLINIC' };
    }
    return { enabled: true, persona, reason: null };
  }

  async staffSession(
    scope: TenantScope,
    user: Pick<UserRecord, 'firstName' | 'lastName' | 'preferredLocale'>,
    pageContext?: ChatSession['pageContext'],
  ): Promise<ChatSession> {
    const { persona, caps, doctorId } = await this.staffPersona(scope);
    const { clinic } = await this.settings.get(scope.clinicId);
    return {
      actor: {
        persona,
        clinicId: scope.clinicId,
        timezone: clinic.timezone,
        locale: user.preferredLocale,
        capabilities: new Set(caps),
        userId: scope.userId,
        role: scope.role,
        doctorId,
        now: new Date(),
      },
      ref: { clinicId: scope.clinicId, type: ACTOR_STAFF, id: scope.userId },
      displayName: `${user.firstName} ${user.lastName}`.trim(),
      clinicName: clinic.name,
      auditUserId: scope.userId,
      pageContext,
    };
  }

  async patientStatus(principal: PortalPrincipal): Promise<AssistantStatus> {
    if (!this.guard.configured) return { enabled: false, persona: null, reason: 'NOT_CONFIGURED' };
    if (!(await this.guard.clinicEnabled(principal.clinicId))) {
      return { enabled: false, persona: null, reason: 'DISABLED_BY_CLINIC' };
    }
    if (!(await this.guard.isPatientVerified(principal.accountId, principal.clinicId))) {
      return { enabled: false, persona: 'patient', reason: 'VERIFICATION_REQUIRED' };
    }
    if (!(await this.guard.hasPatientConsent(principal.accountId, principal.clinicId))) {
      return { enabled: false, persona: 'patient', reason: 'CONSENT_REQUIRED' };
    }
    return { enabled: true, persona: 'patient', reason: null };
  }

  async patientSession(principal: PortalPrincipal): Promise<ChatSession> {
    const { clinic } = await this.settings.get(principal.clinicId);
    const patient = await this.prisma.patient.findFirst({
      where: { id: principal.patientId, clinicId: principal.clinicId },
      select: { firstName: true, lastName: true, firstNameI18n: true, lastNameI18n: true },
    });
    return {
      actor: {
        persona: 'patient',
        clinicId: principal.clinicId,
        timezone: clinic.timezone,
        locale: principal.locale,
        capabilities: new Set(),
        patientId: principal.patientId,
        accountId: principal.accountId,
        now: new Date(),
      },
      ref: { clinicId: principal.clinicId, type: ACTOR_PATIENT, id: principal.accountId },
      displayName: patient ? personName(patient) : '',
      clinicName: clinic.name,
      auditUserId: null,
    };
  }
}
