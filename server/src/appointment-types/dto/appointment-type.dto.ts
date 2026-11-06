import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  Validate,
  ValidatorConstraint,
  type ValidationArguments,
  type ValidatorConstraintInterface,
} from 'class-validator';
import { APPOINTMENT_TYPE_COLORS, DATA_LOCALES, type AppointmentTypeColor } from '@riaya/shared';

/** A LocalizedText object: only en/ar/fr strings of at most 120 characters, at least one filled. */
@ValidatorConstraint({ name: 'localizedText', async: false })
export class LocalizedTextConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.some(([k]) => !(DATA_LOCALES as readonly string[]).includes(k))) return false;
    if (entries.some(([, v]) => v !== undefined && (typeof v !== 'string' || v.length > 120))) {
      return false;
    }
    return entries.some(([, v]) => typeof v === 'string' && v.trim().length > 0);
  }

  defaultMessage(args: ValidationArguments): string {
    return `${args.property} must hold en, fr or ar text (at most 120 characters), at least one`;
  }
}

export class AppointmentTypeQueryDto {
  @ApiPropertyOptional({ description: 'Include deactivated types' })
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true' || value === '1')
  @IsBoolean()
  includeInactive?: boolean;
}

export class CreateAppointmentTypeDto {
  @ApiProperty({ example: { en: 'Vaccination', fr: 'Vaccination', ar: 'تطعيم' } })
  @IsObject()
  @Validate(LocalizedTextConstraint)
  name!: Partial<Record<'en' | 'ar' | 'fr', string>>;

  @ApiPropertyOptional({ description: 'Upper-case A-Z, 0-9, underscore; derived from the name' })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  @Matches(/^[A-Za-z0-9_]+$/)
  code?: string;

  @ApiProperty({ minimum: 5, maximum: 480, description: 'Minutes, multiple of 5' })
  @Type(() => Number)
  @IsInt()
  @Min(5)
  @Max(480)
  durationMinutes!: number;

  @ApiPropertyOptional({ enum: APPOINTMENT_TYPE_COLORS })
  @IsOptional()
  @IsIn(APPOINTMENT_TYPE_COLORS)
  color?: AppointmentTypeColor;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isEmergency?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(10000)
  sortOrder?: number;
}

export class UpdateAppointmentTypeDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  @Validate(LocalizedTextConstraint)
  name?: Partial<Record<'en' | 'ar' | 'fr', string>>;

  @ApiPropertyOptional({ minimum: 5, maximum: 480 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(5)
  @Max(480)
  durationMinutes?: number;

  @ApiPropertyOptional({ enum: APPOINTMENT_TYPE_COLORS })
  @IsOptional()
  @IsIn(APPOINTMENT_TYPE_COLORS)
  color?: AppointmentTypeColor;

  @ApiPropertyOptional({ description: 'Not editable on the EMERGENCY system type' })
  @IsOptional()
  @IsBoolean()
  isEmergency?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(10000)
  sortOrder?: number;

  @ApiPropertyOptional({ description: 'Custom, unused types only; system codes never change' })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  @Matches(/^[A-Za-z0-9_]+$/)
  code?: string;
}
