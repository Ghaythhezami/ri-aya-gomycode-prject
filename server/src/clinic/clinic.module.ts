import { Module } from '@nestjs/common';
import { ClinicController } from './clinic.controller';
import { ClinicReferenceService } from './clinic-reference.service';
import { RoomsService } from './rooms.service';

@Module({
  controllers: [ClinicController],
  providers: [ClinicReferenceService, RoomsService],
  exports: [ClinicReferenceService],
})
export class ClinicModule {}
