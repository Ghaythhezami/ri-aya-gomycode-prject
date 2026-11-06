import { Module } from '@nestjs/common';
import { AppointmentTypesModule } from '../appointment-types/appointment-types.module';
import { SettingsController } from './settings.controller';
import { SettingsService } from './settings.service';

@Module({
  imports: [AppointmentTypesModule],
  controllers: [SettingsController],
  providers: [SettingsService],
})
export class SettingsModule {}
