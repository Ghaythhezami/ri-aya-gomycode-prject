import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';

export class SummarySourceDto {
  @ApiProperty({ enum: ['appointment', 'document', 'note'] })
  @IsIn(['appointment', 'document', 'note'])
  kind!: 'appointment' | 'document' | 'note';

  @ApiProperty()
  @IsString()
  @MaxLength(64)
  id!: string;

  @ApiProperty()
  @IsString()
  @MaxLength(200)
  label!: string;
}

export class SaveSummaryDto {
  @ApiProperty({ description: 'Clinician summary, markdown' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(20000)
  content!: string;

  @ApiPropertyOptional({ description: 'Plain-language version for the patient' })
  @IsOptional()
  @IsString()
  @MaxLength(8000)
  patientContent?: string;

  @ApiPropertyOptional({
    description: 'Share the plain-language version in the portal (sets publishedAt)',
  })
  @IsOptional()
  @IsBoolean()
  visibleToPatient?: boolean;

  @ApiPropertyOptional({ type: [SummarySourceDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => SummarySourceDto)
  sources?: SummarySourceDto[];
}

export class UpdateSummaryDto {
  @ApiPropertyOptional({ description: 'true publishes (sets publishedAt), false unpublishes' })
  @IsOptional()
  @IsBoolean()
  visibleToPatient?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(20000)
  content?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(8000)
  patientContent?: string;
}
