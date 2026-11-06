import { ApiPropertyOptional } from '@nestjs/swagger';
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

import { LocalizedTextDto } from '../../common/locale/localized-text.dto';

const DATE = /^\d{4}-\d{2}-\d{2}$/;

const I18N_DOC = 'Per-language spelling {en?, fr?, ar?}, each at most 120 characters.';

export class CreateDoctorDto {
  /** Canonical name; derived from the i18n value (clinic default language, else first filled) when absent. */
  @IsOptional() @IsString() @MinLength(1) @MaxLength(80) firstName?: string;
  @IsOptional() @IsString() @MinLength(1) @MaxLength(80) lastName?: string;
  @ApiPropertyOptional({ type: LocalizedTextDto, description: I18N_DOC })
  @IsOptional()
  @ValidateNested()
  @Type(() => LocalizedTextDto)
  firstNameI18n?: LocalizedTextDto;
  @ApiPropertyOptional({ type: LocalizedTextDto, description: I18N_DOC })
  @IsOptional()
  @ValidateNested()
  @Type(() => LocalizedTextDto)
  lastNameI18n?: LocalizedTextDto;
  @IsString() @MinLength(1) @MaxLength(80) specialty!: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(5) @Max(240) consultationMinutes?: number;
  @IsOptional() @IsString() @MaxLength(60) licenseNumber?: string;
  @IsOptional() @IsUUID() roomId?: string | null;
}

export class UpdateDoctorDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(80) firstName?: string;
  @IsOptional() @IsString() @MinLength(1) @MaxLength(80) lastName?: string;
  @ApiPropertyOptional({ type: LocalizedTextDto, description: I18N_DOC })
  @IsOptional()
  @ValidateNested()
  @Type(() => LocalizedTextDto)
  firstNameI18n?: LocalizedTextDto;
  @ApiPropertyOptional({ type: LocalizedTextDto, description: I18N_DOC })
  @IsOptional()
  @ValidateNested()
  @Type(() => LocalizedTextDto)
  lastNameI18n?: LocalizedTextDto;
  @IsOptional() @IsString() @MinLength(1) @MaxLength(80) specialty?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(5) @Max(240) consultationMinutes?: number;
  @IsOptional() @IsString() @MaxLength(60) licenseNumber?: string;
  @IsOptional() @IsUUID() roomId?: string | null;
}

export class ListDoctorsQueryDto {
  @ApiPropertyOptional({ description: 'Day for the cards, YYYY-MM-DD (default: today).' })
  @IsOptional()
  @Matches(DATE)
  date?: string;
  @ApiPropertyOptional({
    description:
      'Period start (YYYY-MM-DD, inclusive). Adds `period` stats; max 92 days with `to`.',
  })
  @IsOptional()
  @Matches(DATE)
  from?: string;
  @ApiPropertyOptional({ description: 'Period end (YYYY-MM-DD, inclusive).' })
  @IsOptional()
  @Matches(DATE)
  to?: string;
  @IsOptional() @IsString() @MaxLength(100) search?: string;
  @IsOptional() @IsString() @MaxLength(80) specialty?: string;
}

export class DoctorDateQueryDto {
  @ApiPropertyOptional({ description: 'Day for the card, YYYY-MM-DD (default: today).' })
  @IsOptional()
  @Matches(DATE)
  date?: string;
  @ApiPropertyOptional({
    description: 'Period start (YYYY-MM-DD, inclusive). Adds `period` and `daily`; max 92 days.',
  })
  @IsOptional()
  @Matches(DATE)
  from?: string;
  @ApiPropertyOptional({ description: 'Period end (YYYY-MM-DD, inclusive).' })
  @IsOptional()
  @Matches(DATE)
  to?: string;
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
