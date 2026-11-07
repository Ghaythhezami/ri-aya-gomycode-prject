import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiOperation,
  ApiTags,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { RequireCapability } from '../common/decorators/capability.decorator';

@ApiTags('users')
@ApiBearerAuth()
@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard)
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Post()
  @RequireCapability('manageStaff')
  @ApiOperation({
    summary: 'Create a staff user',
    description: 'Creates a login for a staff member. Requires the manageStaff capability.',
  })
  @ApiCreatedResponse({
    description: 'The created staff user (id, email, names, role; never the password hash)',
  })
  @ApiForbiddenResponse({ description: 'Missing the required capability' })
  @ApiConflictResponse({ description: 'Conflict with the current state' })
  @ApiUnprocessableEntityResponse({ description: 'Validation failed' })
  create(@Body() dto: CreateUserDto) {
    return this.users.createStaffUser(dto).then((user) => ({
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
      preferredLocale: user.preferredLocale,
    }));
  }
}
