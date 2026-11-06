import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  Max,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { QUEUE_PRIORITIES, type QueuePriority } from '@riaya/shared';

export class CheckInDto {
  @IsUUID()
  appointmentId!: string;

  @IsOptional()
  @IsIn(QUEUE_PRIORITIES)
  priority?: QueuePriority;
}

export class CallNextDto {
  @IsOptional()
  @IsUUID()
  doctorId?: string;
}

export class NotifyDelayDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(480)
  minutes!: number;
}

export class PriorityDto {
  @IsIn(QUEUE_PRIORITIES)
  priority!: QueuePriority;
}

export class SelfCheckInDto {
  @IsString()
  @Length(3, 32)
  appointmentCode!: string;

  @Matches(/^\d{4}$/)
  phoneLast4!: string;
}
