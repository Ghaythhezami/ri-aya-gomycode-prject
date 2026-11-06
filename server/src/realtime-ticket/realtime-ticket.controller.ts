import { Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { RealtimeTicket } from '@riaya/shared';
import { RequireCapability } from '../common/decorators/capability.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { RateLimit } from '../common/throttle/rate-limit';
import { TenantContext } from '../tenancy/tenant-context';
import { RealtimeTicketService } from './realtime-ticket.service';

@ApiTags('realtime')
@ApiBearerAuth()
@Controller('realtime')
@UseGuards(JwtAuthGuard, RolesGuard)
@RequireCapability('viewNotifications')
export class RealtimeTicketController {
  constructor(
    private readonly tickets: RealtimeTicketService,
    private readonly tenant: TenantContext,
  ) {}

  @Post('ticket')
  @HttpCode(200)
  @RateLimit(10)
  @ApiOperation({
    summary: 'One-time ticket (60 s) to open the realtime Socket.IO connection',
    description:
      'Returns `{ url, path, ticket, expiresAt }`. `url` and `ticket` are null when realtime is ' +
      'not configured; the client then keeps polling.',
  })
  @ApiOkResponse({
    schema: {
      type: 'object',
      properties: {
        url: { type: 'string', nullable: true },
        path: { type: 'string', example: '/socket.io' },
        ticket: { type: 'string', nullable: true },
        expiresAt: { type: 'string', format: 'date-time', nullable: true },
      },
    },
  })
  issue(): RealtimeTicket {
    const { userId, clinicId, role } = this.tenant.get();
    return this.tickets.issue({ userId, clinicId, role });
  }
}
