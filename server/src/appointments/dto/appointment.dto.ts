import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  Matches,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { APPOINTMENT_STATUSES } from '@riaya/shared';
import type { AppointmentStatus, AppointmentType } from '@riaya/shared';
import { PaginationQueryDto } from '../../common/pagination';

export class CreateAppointmentDto {
  @IsUUID() patientId!: string;
  @IsUUID() doctorId!: string;
  @IsISO8601() startsAt!: string;
  @IsString() @MaxLength(32) @Matches(/^[A-Z0-9_]+$/) type!: AppointmentType;
  @IsOptional() @Type(() => Number) @IsInt() @Min(5) @Max(480) durationMinutes?: number;
  @IsOptional() @IsString() @MaxLength(500) reason?: string;
  @IsOptional() @IsString() @MaxLength(2000) notes?: string;
  @IsOptional() @IsUUID() roomId?: string;
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(2)
  @IsIn(['SMS', 'EMAIL'], { each: true })
  reminderChannels?: ('SMS' | 'EMAIL')[];
  @IsOptional() @IsString() @MaxLength(200) lockToken?: string;
}

export class UpdateAppointmentDto {
  @IsOptional() @IsUUID() doctorId?: string;
  @IsOptional() @IsISO8601() startsAt?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(5) @Max(480) durationMinutes?: number;
  @IsOptional() @IsString() @MaxLength(32) @Matches(/^[A-Z0-9_]+$/) type?: AppointmentType;
  @IsOptional() @IsString() @MaxLength(500) reason?: string;
  @IsOptional() @IsString() @MaxLength(2000) notes?: string;
  @IsOptional() @IsUUID() roomId?: string | null;
  @IsOptional() @IsBoolean() locked?: boolean;
}

export class StatusChangeDto {
  @IsIn(APPOINTMENT_STATUSES) status!: AppointmentStatus;
  @IsOptional() @IsString() @MaxLength(500) reason?: string;
}

export class CancelAppointmentDto {
  @IsOptional() @IsString() @MaxLength(500) reason?: string;
}

export class BulkActionDto {
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(100)
  @IsString({ each: true })
  @MaxLength(64, { each: true })
  ids!: string[];
  @IsIn(['CONFIRM', 'CANCEL']) action!: 'CONFIRM' | 'CANCEL';
  @IsOptional() @IsString() @MaxLength(500) reason?: string;
}

export class CreateLockDto {
  @IsUUID() doctorId!: string;
  @IsISO8601() startsAt!: string;
  @Type(() => Number) @IsInt() @Min(5) @Max(480) durationMinutes!: number;
}

/** Filters shared by the list and the calendar (the calendar ignores paging). */
export class ListAppointmentsQueryDto extends PaginationQueryDto {
  @IsOptional() @IsString() @MaxLength(40) from?: string;
  @IsOptional() @IsString() @MaxLength(40) to?: string;
  @IsOptional() @IsUUID() doctorId?: string;
  @IsOptional() @IsString() @MaxLength(80) specialty?: string;
  @IsOptional() @IsString() @MaxLength(200) status?: string;
  @IsOptional() @IsString() @MaxLength(200) type?: string;
  @IsOptional() @IsString() @MaxLength(100) search?: string;
}

export class ChangeAppointmentTypeDto {
  @IsString() @MaxLength(32) @Matches(/^[A-Z0-9_]+$/) type!: string;
  @IsOptional() @IsBoolean() keepDuration?: boolean;
}
