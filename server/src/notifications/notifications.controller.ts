import {
  Controller,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Post,
  Query,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiExcludeController,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { timingSafeEqual } from 'node:crypto';
import { NOTIFICATION_CATEGORIES, type NotificationCategory } from '@riaya/shared';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { RequireCapability } from '../common/decorators/capability.decorator';
import { TenantContext } from '../tenancy/tenant-context';
import { NotificationsService } from './notifications.service';
import { ReminderProcessor } from './reminder.processor';

export class ListNotificationsDto {
  @IsOptional()
  @IsIn(NOTIFICATION_CATEGORIES)
  category?: NotificationCategory;

  @IsOptional()
  @Type(() => String)
  @IsIn(['true', 'false', '1', '0'])
  unread?: string;

  @IsOptional()
  @IsString()
  cursor?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

@ApiTags('notifications')
@ApiBearerAuth()
@Controller('notifications')
@UseGuards(JwtAuthGuard, RolesGuard)
@RequireCapability('viewNotifications')
export class NotificationsController {
  constructor(
    private readonly notifications: NotificationsService,
    private readonly processor: ReminderProcessor,
    private readonly tenant: TenantContext,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'List notifications',
    description:
      'Cursor-paginated notifications of the signed-in user, filterable by category and unread. Requires the viewNotifications capability.',
  })
  @ApiOkResponse({ description: 'Page of NotificationDto' })
  @ApiForbiddenResponse({ description: 'Missing the required capability' })
  list(@Query() query: ListNotificationsDto) {
    const { clinicId, userId } = this.tenant.get();
    return this.notifications.list(clinicId, userId, {
      category: query.category,
      unread: query.unread === 'true' || query.unread === '1',
      cursor: query.cursor,
      limit: query.limit,
    });
  }

  @Get('unread-count')
  @ApiOperation({
    summary: 'Count unread notifications',
    description: 'Unread total for the signed-in user. Requires the viewNotifications capability.',
  })
  @ApiOkResponse({ description: 'Object with count' })
  @ApiForbiddenResponse({ description: 'Missing the required capability' })
  async unreadCount() {
    const { clinicId, userId } = this.tenant.get();
    return { count: await this.notifications.unreadCount(clinicId, userId) };
  }

  @Get('delivery-stats')
  @ApiOperation({
    summary: 'Get reminder delivery statistics',
    description:
      'Delivery outcomes of reminders for the clinic; processes due reminders first. Requires the viewNotifications capability.',
  })
  @ApiOkResponse({ description: 'DeliveryStats' })
  @ApiForbiddenResponse({ description: 'Missing the required capability' })
  async deliveryStats() {
    const { clinicId } = this.tenant.get();
    await this.processor.processDue(new Date(), 50).catch(() => undefined);
    return this.notifications.deliveryStats(clinicId);
  }

  @Post('read-all')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Mark all notifications as read',
    description:
      'Marks every notification of the signed-in user as read. Requires the viewNotifications capability.',
  })
  @ApiOkResponse({ description: 'Updated count' })
  @ApiForbiddenResponse({ description: 'Missing the required capability' })
  readAll() {
    const { clinicId, userId } = this.tenant.get();
    return this.notifications.markAllRead(clinicId, userId);
  }

  @Post(':id/read')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Mark a notification as read',
    description: 'Marks one notification as read. Requires the viewNotifications capability.',
  })
  @ApiOkResponse({ description: 'NotificationDto' })
  @ApiForbiddenResponse({ description: 'Missing the required capability' })
  @ApiNotFoundResponse({ description: 'Not found in this clinic' })
  read(@Param('id') id: string) {
    const { clinicId, userId } = this.tenant.get();
    return this.notifications.markRead(clinicId, userId, id);
  }
}

function secretMatches(provided: string | undefined, expected: string): boolean {
  if (!provided) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Vercel Cron entry point (GET with a Bearer secret) and manual trigger (POST). */
// Secret-protected (CRON_SECRET) infrastructure endpoint, not part of the public API surface.
@ApiExcludeController()
@Controller('notifications/reminders')
export class RemindersCronController {
  constructor(private readonly processor: ReminderProcessor) {}

  private async run(req: { headers: Record<string, string | string[] | undefined> }) {
    const expected = process.env.CRON_SECRET;
    if (!expected) throw new NotFoundException();
    const header = (name: string) => {
      const v = req.headers[name];
      return Array.isArray(v) ? v[0] : v;
    };
    const bearer = header('authorization')?.replace(/^Bearer\s+/i, '');
    if (!secretMatches(header('x-cron-secret'), expected) && !secretMatches(bearer, expected)) {
      throw new UnauthorizedException({ code: 'UNAUTHORIZED', message: 'Invalid cron secret' });
    }
    return this.processor.processDue(new Date(), 200);
  }

  @Get('process')
  processGet(@Req() req: { headers: Record<string, string | string[] | undefined> }) {
    return this.run(req);
  }

  @Post('process')
  @HttpCode(200)
  processPost(@Req() req: { headers: Record<string, string | string[] | undefined> }) {
    return this.run(req);
  }
}
