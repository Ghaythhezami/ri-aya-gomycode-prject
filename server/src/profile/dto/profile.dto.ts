import { ApiPropertyOptional, ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsObject, IsOptional, IsString, MaxLength, ValidateNested } from 'class-validator';
import { DATA_LOCALES, type DataLocale } from '@riaya/shared';
import { LocalizedTextDto } from '../../roles/dto/role.dto';

export class UpdateProfileDto {
  @ApiPropertyOptional({ type: LocalizedTextDto })
  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => LocalizedTextDto)
  firstNameI18n?: LocalizedTextDto;

  @ApiPropertyOptional({ type: LocalizedTextDto })
  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => LocalizedTextDto)
  lastNameI18n?: LocalizedTextDto;

  @ApiPropertyOptional({
    nullable: true,
    description: 'International format, 7 to 15 digits with an optional leading +. Null clears it.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  phone?: string | null;

  @ApiPropertyOptional({ nullable: true, maxLength: 80 })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  jobTitle?: string | null;

  @ApiPropertyOptional({ enum: DATA_LOCALES })
  @IsOptional()
  @IsIn(DATA_LOCALES)
  preferredLocale?: DataLocale;
}

export class CompleteOnboardingDto {
  @ApiProperty({ enum: ['user', 'clinic'] })
  @IsIn(['user', 'clinic'])
  scope!: 'user' | 'clinic';
}
