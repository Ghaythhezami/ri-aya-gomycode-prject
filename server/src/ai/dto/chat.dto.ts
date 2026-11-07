import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { MAX_MESSAGE_CHARS } from '../ai.constants';

export class ChatContextDto {
  @ApiPropertyOptional({ description: 'Patient the user is viewing' })
  @IsOptional()
  @IsUUID()
  patientId?: string;

  @ApiPropertyOptional({ example: '2026-11-07' })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  date?: string;
}

export class PortalChatDto {
  @ApiPropertyOptional({ description: 'Continue this conversation; omit to start a new one' })
  @IsOptional()
  @IsUUID()
  conversationId?: string;

  @ApiProperty({ maxLength: MAX_MESSAGE_CHARS })
  @IsString()
  @IsNotEmpty()
  @MaxLength(MAX_MESSAGE_CHARS)
  message!: string;
}

export class ChatDto extends PortalChatDto {
  @ApiPropertyOptional({ type: ChatContextDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => ChatContextDto)
  context?: ChatContextDto;
}
