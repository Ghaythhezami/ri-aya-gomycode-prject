import { ApiPropertyOptional } from '@nestjs/swagger';
import { LOCALIZED_NAME_MAX } from '@riaya/shared';
import { IsOptional, IsString, MaxLength } from 'class-validator';

/** `{ en?, fr?, ar? }`, each at most 120 characters; any other key is rejected by the pipe. */
export class LocalizedTextDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(LOCALIZED_NAME_MAX) en?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(LOCALIZED_NAME_MAX) fr?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(LOCALIZED_NAME_MAX) ar?: string;
}
