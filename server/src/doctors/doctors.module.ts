import { Module } from '@nestjs/common';
import { ClinicModule } from '../clinic/clinic.module';
import { SlotLocksModule } from '../appointments/slot-locks.module';
import { DoctorsController } from './doctors.controller';
import { DoctorsService } from './doctors.service';

@Module({
  imports: [ClinicModule, SlotLocksModule],
  controllers: [DoctorsController],
  providers: [DoctorsService],
  exports: [DoctorsService],
})
export class DoctorsModule {}
