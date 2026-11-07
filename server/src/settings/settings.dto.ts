import { LocalizedTextDto } from '../common/locale/localized-text.dto';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEmail,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
  registerDecorator,
  type ValidationOptions,
} from 'class-validator';
import { isValidTimeZone } from '../core/clinic-time';

function IsTimeZone(options?: ValidationOptions) {
  return (target: object, propertyName: string) =>
    registerDecorator({
      name: 'isTimeZone',
      target: target.constructor,
      propertyName,
      options: { message: 'timezone must be a valid IANA time zone', ...options },
      validator: {
        validate: (value: unknown) => typeof value === 'string' && isValidTimeZone(value),
      },
    });
}

export const SLOT_MINUTES = [5, 10, 15, 20, 30] as const;

export class ClinicPartDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name?: string;

  @ApiPropertyOptional({
    type: LocalizedTextDto,
    description:
      'Clinic name per language {en?, fr?, ar?}; the canonical name follows it when absent.',
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => LocalizedTextDto)
  nameI18n?: LocalizedTextDto;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  address?: string | null;

  @IsOptional()
  @IsTimeZone()
  timezone?: string;

  @IsOptional()
  @Matches(/^[A-Z]{3}$/, { message: 'currency must be a 3-letter ISO code' })
  currency?: string;
}

export class DurationsDto {
  @IsOptional()
  @IsInt()
  @Min(5)
  @Max(240)
  CONSULTATION?: number;

  @IsOptional()
  @IsInt()
  @Min(5)
  @Max(240)
  FOLLOW_UP?: number;

  @IsOptional()
  @IsInt()
  @Min(5)
  @Max(240)
  EMERGENCY?: number;
}

export class OpeningDayDto {
  @IsInt()
  @Min(0)
  @Max(6)
  weekday!: number;

  @IsInt()
  @Min(0)
  @Max(1440)
  open!: number;

  @IsInt()
  @Min(0)
  @Max(1440)
  close!: number;

  @IsBoolean()
  closed!: boolean;
}

export class DepartmentDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  id?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name!: string;

  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  @MaxLength(100, { each: true })
  specialties!: string[];
}

export class AppearanceDto {
  @IsOptional()
  @IsIn(['comfortable', 'compact'])
  density?: 'comfortable' | 'compact';

  @IsOptional()
  @IsBoolean()
  highContrast?: boolean;

  @IsOptional()
  @IsBoolean()
  reduceMotion?: boolean;
}

export class UpdateSettingsDto {
  @IsOptional()
  @ValidateNested()
  @Type(() => ClinicPartDto)
  clinic?: ClinicPartDto;

  @IsOptional()
  @IsEmail()
  @MaxLength(254)
  contactEmail?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  phone?: string | null;

  @IsOptional()
  @IsIn(['en', 'ar', 'fr'])
  defaultLanguage?: 'en' | 'ar' | 'fr';

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(72)
  cancellationNoticeHours?: number;

  @IsOptional()
  @IsBoolean()
  requireCancelReason?: boolean;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(240)
  targetWaitMinutes?: number;

  @IsOptional()
  @IsInt()
  @IsIn(SLOT_MINUTES)
  slotMinutes?: number;

  @IsOptional()
  @ValidateNested()
  @Type(() => DurationsDto)
  durations?: DurationsDto;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(4)
  @IsInt({ each: true })
  @Min(15, { each: true })
  @Max(10080, { each: true })
  reminderOffsets?: number[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(2)
  @IsIn(['SMS', 'EMAIL'], { each: true })
  reminderChannels?: ('SMS' | 'EMAIL')[];

  @IsOptional()
  @IsArray()
  @ArrayMinSize(7)
  @ArrayMaxSize(7)
  @ValidateNested({ each: true })
  @Type(() => OpeningDayDto)
  openingHours?: OpeningDayDto[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => DepartmentDto)
  departments?: DepartmentDto[];

  @IsOptional()
  @ValidateNested()
  @Type(() => AppearanceDto)
  appearance?: AppearanceDto;
}

export class AuditQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  entity?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  actorId?: string;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  from?: string;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  to?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  cursor?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}
