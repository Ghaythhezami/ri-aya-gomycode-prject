import { Module } from '@nestjs/common';
import { AppointmentTypesModule } from '../appointment-types/appointment-types.module';
import { DoctorsModule } from '../doctors/doctors.module';
import { AppointmentsController } from './appointments.controller';
import { AppointmentsService } from './appointments.service';
import { SlotLocksModule } from './slot-locks.module';

@Module({
  imports: [AppointmentTypesModule, DoctorsModule, SlotLocksModule],
  controllers: [AppointmentsController],
  providers: [AppointmentsService],
  exports: [AppointmentsService],
})
export class AppointmentsModule {}
