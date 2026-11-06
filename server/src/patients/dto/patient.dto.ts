import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
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
import { LocalizedTextDto } from '../../common/locale/localized-text.dto';
import { PaginationQueryDto } from '../../common/pagination';

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const PHONE = /^\+?[0-9 ()-]{6,24}$/;

export class CreatePatientDto {
  /** Canonical name; derived from the i18n value (clinic default language, else first filled) when absent. */
  @IsOptional() @IsString() @MinLength(1) @MaxLength(80) firstName?: string;
  @IsOptional() @IsString() @MinLength(1) @MaxLength(80) lastName?: string;
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
  @Matches(DATE) dateOfBirth!: string;
  @Matches(PHONE) phone!: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsIn(['female', 'male']) gender?: 'female' | 'male';
  @IsOptional() @IsString() @MaxLength(300) address?: string;
  @IsOptional() @IsIn(['SMS', 'EMAIL', 'PHONE']) contactPreference?: 'SMS' | 'EMAIL' | 'PHONE';
  @IsOptional() @IsString() @MaxLength(2000) adminNotes?: string;
  @IsOptional() @IsBoolean() force?: boolean;
}

export class UpdatePatientDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(80) firstName?: string;
  @IsOptional() @IsString() @MinLength(1) @MaxLength(80) lastName?: string;
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
  @IsOptional() @Matches(DATE) dateOfBirth?: string;
  @IsOptional() @Matches(PHONE) phone?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsIn(['female', 'male']) gender?: 'female' | 'male';
  @IsOptional() @IsString() @MaxLength(300) address?: string;
  @IsOptional() @IsIn(['SMS', 'EMAIL', 'PHONE']) contactPreference?: 'SMS' | 'EMAIL' | 'PHONE';
  @IsOptional() @IsString() @MaxLength(2000) adminNotes?: string;
  @IsOptional() @IsString() @MaxLength(5000) clinicalNotes?: string;
}

export const PATIENT_SORTS = ['name', 'code', 'createdAt', 'lastVisit'] as const;

export class ListPatientsQueryDto extends PaginationQueryDto {
  @IsOptional() @IsString() @MaxLength(100) search?: string;
  @IsOptional() @IsIn(['ACTIVE', 'ARCHIVED']) status?: 'ACTIVE' | 'ARCHIVED';
  @IsOptional() @IsIn(['female', 'male']) gender?: 'female' | 'male';
}

export class DuplicatesQueryDto {
  @IsOptional() @IsString() @MaxLength(80) firstName?: string;
  @IsOptional() @IsString() @MaxLength(80) lastName?: string;
  @IsOptional() @Matches(DATE) dateOfBirth?: string;
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(30)
  phone?: string;
}
