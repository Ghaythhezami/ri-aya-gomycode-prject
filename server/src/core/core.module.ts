import { Global, Module } from '@nestjs/common';
import { ClinicSettingsReader } from './clinic-settings.reader';

/** Cross-cutting clinic helpers available to every module. */
@Global()
@Module({
  providers: [ClinicSettingsReader],
  exports: [ClinicSettingsReader],
})
export class CoreModule {}
