import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export class CreateDoctorDto {
  @IsString() @MinLength(1) @MaxLength(80) firstName!: string;
  @IsString() @MinLength(1) @MaxLength(80) lastName!: string;
  @IsString() @MinLength(1) @MaxLength(80) specialty!: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(5) @Max(240) consultationMinutes?: number;
  @IsOptional() @IsString() @MaxLength(60) licenseNumber?: string;
  @IsOptional() @IsUUID() roomId?: string | null;
}

export class UpdateDoctorDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(80) firstName?: string;
  @IsOptional() @IsString() @MinLength(1) @MaxLength(80) lastName?: string;
  @IsOptional() @IsString() @MinLength(1) @MaxLength(80) specialty?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(5) @Max(240) consultationMinutes?: number;
  @IsOptional() @IsString() @MaxLength(60) licenseNumber?: string;
  @IsOptional() @IsUUID() roomId?: string | null;
}

export class ListDoctorsQueryDto {
  @IsOptional() @Matches(DATE) date?: string;
  @IsOptional() @IsString() @MaxLength(100) search?: string;
  @IsOptional() @IsString() @MaxLength(80) specialty?: string;
}

export class DoctorDateQueryDto {
  @IsOptional() @Matches(DATE) date?: string;
}

export class SlotsQueryDto {
  @IsOptional() @Matches(DATE) date?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(5) @Max(480) durationMinutes?: number;
}

export class WorkingIntervalDto {
  @Type(() => Number) @IsInt() @Min(0) @Max(6) weekday!: number;
  @Type(() => Number) @IsInt() @Min(0) @Max(1439) startMinute!: number;
  @Type(() => Number) @IsInt() @Min(1) @Max(1440) endMinute!: number;
  @IsIn(['WORK', 'BREAK']) kind!: 'WORK' | 'BREAK';
}

export class PutWorkingHoursDto {
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => WorkingIntervalDto)
  intervals!: WorkingIntervalDto[];

  @IsOptional() @IsBoolean() confirm?: boolean;
}

export class CreateLeaveDto {
  @IsISO8601() startsAt!: string;
  @IsISO8601() endsAt!: string;
  @IsOptional() @IsString() @MaxLength(200) reason?: string;
}
