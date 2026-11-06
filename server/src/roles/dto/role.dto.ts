import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsIn,
  IsNotEmptyObject,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { CAPABILITIES, LOCALIZED_NAME_MAX, USER_ROLES } from '@riaya/shared';

/** LocalizedText as a validated object: any subset of en / ar / fr, each at most 120 characters. */
export class LocalizedTextDto {
  @ApiPropertyOptional({ maxLength: LOCALIZED_NAME_MAX })
  @IsOptional()
  @IsString()
  @MaxLength(LOCALIZED_NAME_MAX)
  en?: string;

  @ApiPropertyOptional({ maxLength: LOCALIZED_NAME_MAX })
  @IsOptional()
  @IsString()
  @MaxLength(LOCALIZED_NAME_MAX)
  ar?: string;

  @ApiPropertyOptional({ maxLength: LOCALIZED_NAME_MAX })
  @IsOptional()
  @IsString()
  @MaxLength(LOCALIZED_NAME_MAX)
  fr?: string;
}

export class CreateRoleDto {
  @ApiProperty({ type: LocalizedTextDto, description: 'At least one language is required.' })
  @IsObject()
  @IsNotEmptyObject()
  @ValidateNested()
  @Type(() => LocalizedTextDto)
  name!: LocalizedTextDto;

  @ApiPropertyOptional({ type: LocalizedTextDto })
  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => LocalizedTextDto)
  description?: LocalizedTextDto;

  @ApiProperty({ enum: USER_ROLES, description: 'Data scope and legacy role of the members.' })
  @IsIn(USER_ROLES)
  baseRole!: (typeof USER_ROLES)[number];

  @ApiProperty({ enum: CAPABILITIES, isArray: true })
  @IsArray()
  @ArrayMaxSize(CAPABILITIES.length)
  @ArrayUnique()
  @IsIn(CAPABILITIES, { each: true })
  capabilities!: (typeof CAPABILITIES)[number][];
}

export class UpdateRoleDto {
  @ApiPropertyOptional({ type: LocalizedTextDto })
  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => LocalizedTextDto)
  name?: LocalizedTextDto;

  @ApiPropertyOptional({ type: LocalizedTextDto })
  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => LocalizedTextDto)
  description?: LocalizedTextDto;

  @ApiPropertyOptional({ enum: USER_ROLES, description: 'Ignored-and-rejected for system roles.' })
  @IsOptional()
  @IsIn(USER_ROLES)
  baseRole?: (typeof USER_ROLES)[number];

  @ApiPropertyOptional({ enum: CAPABILITIES, isArray: true })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(CAPABILITIES.length)
  @ArrayUnique()
  @IsIn(CAPABILITIES, { each: true })
  capabilities?: (typeof CAPABILITIES)[number][];
}

export class AssignRoleDto {
  @ApiProperty({ description: 'A system role name (DOCTOR, ...) or a custom role key.' })
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  roleKey!: string;
}
