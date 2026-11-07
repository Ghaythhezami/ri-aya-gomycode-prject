import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';

/** 24-hour clock value accepted by the working-hours editor (e.g. 08:00). */
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

export class WorkingHoursBreakDto {
  @Matches(TIME, { message: 'INVALID_TIME' })
  start!: string;

  @Matches(TIME, { message: 'INVALID_TIME' })
  end!: string;
}

export class WorkingHoursDayDto {
  @IsBoolean()
  open!: boolean;

  @Matches(TIME, { message: 'INVALID_TIME' })
  start!: string;

  @Matches(TIME, { message: 'INVALID_TIME' })
  end!: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => WorkingHoursBreakDto)
  breaks!: WorkingHoursBreakDto[];
}

/**
 * The whole week is submitted at once. Sending a partial week would make a
 * missing day indistinguishable from "keep the stored value", so the editor
 * always owns all seven rows.
 */
export class WorkingHoursDto {
  @ValidateNested()
  @Type(() => WorkingHoursDayDto)
  monday!: WorkingHoursDayDto;

  @ValidateNested()
  @Type(() => WorkingHoursDayDto)
  tuesday!: WorkingHoursDayDto;

  @ValidateNested()
  @Type(() => WorkingHoursDayDto)
  wednesday!: WorkingHoursDayDto;

  @ValidateNested()
  @Type(() => WorkingHoursDayDto)
  thursday!: WorkingHoursDayDto;

  @ValidateNested()
  @Type(() => WorkingHoursDayDto)
  friday!: WorkingHoursDayDto;

  @ValidateNested()
  @Type(() => WorkingHoursDayDto)
  saturday!: WorkingHoursDayDto;

  @ValidateNested()
  @Type(() => WorkingHoursDayDto)
  sunday!: WorkingHoursDayDto;
}

/** Editable clinic settings (BP-035). Every field is optional, so a form can save one section. */
export class UpdateClinicSettingsDto {
  @ApiPropertyOptional({ example: 'Downtown Branch' })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name?: string;

  @ApiPropertyOptional({ example: '12 Marina Road, Lagos' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  address?: string | null;

  @ApiPropertyOptional({ example: 'operations@clinic.example' })
  @IsOptional()
  @IsEmail()
  contactEmail?: string | null;

  @ApiPropertyOptional({ example: '+234 800 000 0000' })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone?: string | null;

  @ApiPropertyOptional({ enum: ['en', 'ar', 'fr'] })
  @IsOptional()
  @IsIn(['en', 'ar', 'fr'])
  defaultLanguage?: 'en' | 'ar' | 'fr';

  @ApiPropertyOptional({ example: 'Africa/Lagos' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  timezone?: string;

  @ApiPropertyOptional({ type: WorkingHoursDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => WorkingHoursDto)
  workingHours?: WorkingHoursDto;
}
