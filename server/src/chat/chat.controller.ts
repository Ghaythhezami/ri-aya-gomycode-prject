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
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
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
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { RequireCapability } from '../common/decorators/capability.decorator';
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
@RequireCapability('viewChat')
export class ChatController {
  constructor(
    private readonly chat: ChatService,
    private readonly tenant: TenantContext,
  ) {}

  @Get('staff')
  @ApiOperation({
    summary: 'List staff available to chat',
    description: 'Colleagues of the clinic who can be messaged. Requires the viewChat capability.',
  })
  @ApiOkResponse({ description: 'PersonRef[]' })
  @ApiForbiddenResponse({ description: 'Missing the required capability' })
  staff() {
    return this.chat.staff(this.tenant.get().clinicId);
  }

  @Get('conversations')
  @ApiOperation({
    summary: 'List my conversations',
    description:
      'Conversations of the signed-in user with unread counts. Requires the viewChat capability.',
  })
  @ApiOkResponse({ description: 'ConversationDto[]' })
  @ApiForbiddenResponse({ description: 'Missing the required capability' })
  list() {
    const { clinicId, userId } = this.tenant.get();
    return this.chat.list(clinicId, userId);
  }

  @Post('conversations')
  @ApiOperation({
    summary: 'Start or open a conversation',
    description:
      'Creates a conversation, or returns the existing direct one. Requires the viewChat capability.',
  })
  @ApiCreatedResponse({ description: 'ConversationDto' })
  @ApiForbiddenResponse({ description: 'Missing the required capability' })
  @ApiUnprocessableEntityResponse({ description: 'Validation failed' })
  create(@Body() dto: CreateConversationDto) {
    const { clinicId, userId } = this.tenant.get();
    return this.chat.create(clinicId, userId, dto);
  }

  @Get('conversations/:id/messages')
  @ApiOperation({
    summary: 'List messages of a conversation',
    description:
      'Cursor-paginated messages of a conversation the user belongs to. Requires the viewChat capability.',
  })
  @ApiOkResponse({ description: 'Page of ChatMessageDto' })
  @ApiForbiddenResponse({ description: 'Missing the required capability' })
  @ApiNotFoundResponse({ description: 'Not found in this clinic' })
  messages(@Param('id', ParseUUIDPipe) id: string, @Query() query: MessagesQueryDto) {
    const { clinicId, userId } = this.tenant.get();
    return this.chat.messages(clinicId, userId, id, query);
  }

  @Post('conversations/:id/messages')
  @ApiOperation({
    summary: 'Send a message',
    description:
      'Posts a message to a conversation the user belongs to. Requires the viewChat capability.',
  })
  @ApiCreatedResponse({ description: 'ChatMessageDto' })
  @ApiForbiddenResponse({ description: 'Missing the required capability' })
  @ApiNotFoundResponse({ description: 'Not found in this clinic' })
  post(@Param('id', ParseUUIDPipe) id: string, @Body() dto: SendMessageDto) {
    const { clinicId, userId } = this.tenant.get();
    return this.chat.post(clinicId, userId, id, dto.body);
  }

  @Post('conversations/:id/read')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Mark a conversation as read',
    description:
      'Resets the unread counter for the signed-in user. Requires the viewChat capability.',
  })
  @ApiOkResponse({ description: 'ConversationDto' })
  @ApiForbiddenResponse({ description: 'Missing the required capability' })
  @ApiNotFoundResponse({ description: 'Not found in this clinic' })
  read(@Param('id', ParseUUIDPipe) id: string) {
    const { clinicId, userId } = this.tenant.get();
    return this.chat.markRead(clinicId, userId, id);
  }
}
