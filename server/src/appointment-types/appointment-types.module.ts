import { Module } from '@nestjs/common';
import { AppointmentTypesController } from './appointment-types.controller';
import { AppointmentTypesService } from './appointment-types.service';

@Module({
  controllers: [AppointmentTypesController],
  providers: [AppointmentTypesService],
  exports: [AppointmentTypesService],
})
export class AppointmentTypesModule {}
