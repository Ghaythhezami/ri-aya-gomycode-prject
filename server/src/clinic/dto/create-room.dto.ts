import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsOptional, IsString, MaxLength, MinLength, ValidateNested } from 'class-validator';
import { LocalizedTextDto } from '../../common/locale/localized-text.dto';

export class CreateRoomDto {
  /** Canonical name; derived from `nameI18n` (clinic default language, else first filled) when absent. */
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  name?: string;

  @ApiPropertyOptional({
    type: LocalizedTextDto,
    description: 'Per-language name {en?, fr?, ar?}, each at most 120 characters.',
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => LocalizedTextDto)
  nameI18n?: LocalizedTextDto;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  kind?: string;
}
