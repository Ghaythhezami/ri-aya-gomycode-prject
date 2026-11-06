import { IsIn, IsISO8601, IsUUID, Matches } from 'class-validator';
import { OPTIMIZATION_OBJECTIVES, type OptimizationObjective } from '@riaya/shared';

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export class DateQueryDto {
  @Matches(DATE, { message: 'date must be YYYY-MM-DD' })
  date!: string;
}

export class OptimizeDto {
  @Matches(DATE, { message: 'date must be YYYY-MM-DD' })
  date!: string;

  @IsIn(OPTIMIZATION_OBJECTIVES)
  objective!: OptimizationObjective;
}

export class ValidateMoveDto {
  @IsUUID()
  appointmentId!: string;

  @IsUUID()
  doctorId!: string;

  @IsISO8601()
  startsAt!: string;
}
