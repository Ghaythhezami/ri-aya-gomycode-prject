import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsISO8601,
  Max,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { LocalizedTextDto } from '../../common/locale/localized-text.dto';
import { DATE, LOCALES, PHONE } from './portal-auth.dto';

/** Mirrors `PortalProfileInput`. */
export class PortalProfileDto {
  @ApiPropertyOptional({ type: LocalizedTextDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => LocalizedTextDto)
  firstNameI18n?: LocalizedTextDto;
  @ApiPropertyOptional({ type: LocalizedTextDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => LocalizedTextDto)
  lastNameI18n?: LocalizedTextDto;
  @ApiPropertyOptional() @IsOptional() @Matches(PHONE) phone?: string;
  @ApiPropertyOptional({ enum: LOCALES }) @IsOptional() @IsIn(LOCALES) preferredLocale?:
    'en' | 'fr' | 'ar';
  @ApiPropertyOptional({ enum: ['SMS', 'EMAIL'] })
  @IsOptional()
  @IsIn(['SMS', 'EMAIL'])
  contactPreference?: 'SMS' | 'EMAIL';
  @ApiPropertyOptional() @IsOptional() @IsBoolean() aiConsent?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() onboardingCompleted?: boolean;
}

export class PortalSlotsQueryDto {
  @ApiProperty() @IsUUID() doctorId!: string;
  @ApiProperty({ example: '2026-11-20' }) @Matches(DATE) date!: string;
  @ApiPropertyOptional({ description: 'Visit length in minutes (from the chosen type)' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(5)
  @Max(480)
  durationMinutes?: number;
}

export class PortalAppointmentsQueryDto {
  @ApiPropertyOptional({ enum: ['upcoming', 'past'] })
  @IsOptional()
  @IsIn(['upcoming', 'past'])
  scope?: 'upcoming' | 'past';
}

/** Mirrors `PortalBookInput`. */
export class PortalBookDto {
  @ApiProperty() @IsUUID() doctorId!: string;
  @ApiProperty() @IsString() @MaxLength(32) @Matches(/^[A-Z0-9_]+$/) type!: string;
  @ApiProperty() @IsISO8601() startsAt!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(500) reason?: string;
}

/** Mirrors `PortalRescheduleInput`. */
export class PortalRescheduleDto {
  @ApiProperty() @IsISO8601() startsAt!: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() doctorId?: string;
}

export class PortalCancelDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(500) reason?: string;
}
