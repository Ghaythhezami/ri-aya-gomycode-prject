import { Module } from '@nestjs/common';
import { AppointmentTypesModule } from '../appointment-types/appointment-types.module';
import { AppointmentsModule } from '../appointments/appointments.module';
import { DoctorsModule } from '../doctors/doctors.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { PortalAuthController } from './portal-auth.controller';
import { PortalAuthModule } from './portal-auth.module';
import { PortalAuthService } from './auth/portal-auth.service';
import { PortalTokenService } from './auth/portal-token.service';
import { PortalController } from './portal.controller';
import { PortalService } from './portal.service';
import { StaffInviteController } from './staff-invite.controller';
import { StaffInviteService } from './staff-invite.service';

@Module({
  imports: [
    PortalAuthModule,
    AppointmentsModule,
    AppointmentTypesModule,
    DoctorsModule,
    NotificationsModule,
  ],
  controllers: [PortalAuthController, PortalController, StaffInviteController],
  providers: [PortalTokenService, PortalAuthService, PortalService, StaffInviteService],
})
export class PortalModule {}
