import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { CAPABILITY_ROLES } from '@riaya/shared';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { TenantContext } from '../tenancy/tenant-context';
import { ChatService } from './chat.service';

export class CreateConversationDto {
  @IsArray()
  @ArrayMaxSize(50)
  @IsUUID('all', { each: true })
  memberIds!: string[];

  @IsOptional()
  @IsString()
  @MaxLength(120)
  title?: string;
}

export class SendMessageDto {
  /** Plain text only; the client renders it as text, never as HTML. */
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(1, 2000)
  body!: string;
}

export class MessagesQueryDto {
  @IsOptional()
  @IsString()
  before?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;
}

@ApiTags('chat')
@ApiBearerAuth()
@Controller('chat')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(...CAPABILITY_ROLES.viewChat)
export class ChatController {
  constructor(
    private readonly chat: ChatService,
    private readonly tenant: TenantContext,
  ) {}

  @Get('staff')
  staff() {
    return this.chat.staff(this.tenant.get().clinicId);
  }

  @Get('conversations')
  list() {
    const { clinicId, userId } = this.tenant.get();
    return this.chat.list(clinicId, userId);
  }

  @Post('conversations')
  create(@Body() dto: CreateConversationDto) {
    const { clinicId, userId } = this.tenant.get();
    return this.chat.create(clinicId, userId, dto);
  }

  @Get('conversations/:id/messages')
  messages(@Param('id', ParseUUIDPipe) id: string, @Query() query: MessagesQueryDto) {
    const { clinicId, userId } = this.tenant.get();
    return this.chat.messages(clinicId, userId, id, query);
  }

  @Post('conversations/:id/messages')
  post(@Param('id', ParseUUIDPipe) id: string, @Body() dto: SendMessageDto) {
    const { clinicId, userId } = this.tenant.get();
    return this.chat.post(clinicId, userId, id, dto.body);
  }

  @Post('conversations/:id/read')
  @HttpCode(200)
  read(@Param('id', ParseUUIDPipe) id: string) {
    const { clinicId, userId } = this.tenant.get();
    return this.chat.markRead(clinicId, userId, id);
  }
}
