import { Module } from '@nestjs/common';
import { ClinicModule } from './clinic/clinic.module';
import { PatientsModule } from './patients/patients.module';
import { DoctorsModule } from './doctors/doctors.module';
import { AppointmentsModule } from './appointments/appointments.module';

/**
 * Clinical core: reference data, rooms, patients, doctors, availability and
 * appointments. Owned by the clinical-core workstream.
 */
@Module({
  imports: [ClinicModule, PatientsModule, DoctorsModule, AppointmentsModule],
})
export class ClinicalModule {}
