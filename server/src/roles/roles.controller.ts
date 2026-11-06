import { Body, Controller, Delete, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { RateLimit } from '../common/throttle/rate-limit';
import { RequireCapability } from '../common/decorators/capability.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { parseAcceptLanguage } from '../rbac/locale.util';
import { AssignRoleDto, CreateRoleDto, UpdateRoleDto } from './dto/role.dto';
import { RolesService } from './roles.service';

@ApiTags('roles')
@ApiBearerAuth()
@Controller('roles')
@UseGuards(JwtAuthGuard, RolesGuard)
export class RolesController {
  constructor(private readonly roles: RolesService) {}

  @Get()
  @RequireCapability('manageRoles')
  @ApiOperation({ summary: 'Permissions matrix: capabilities, system roles and custom roles' })
  @ApiResponse({ status: 200, description: 'PermissionsMatrix with member counts' })
  list(@Req() req: Request) {
    return this.roles.matrix(parseAcceptLanguage(req.headers['accept-language']));
  }

  @Post()
  @RateLimit(30)
  @RequireCapability('manageRoles')
  @ApiOperation({ summary: 'Create a custom role (at most 30 per clinic)' })
  @ApiResponse({ status: 201, description: 'The created RoleDto' })
  @ApiResponse({ status: 403, description: 'Grants a capability the caller does not hold' })
  @ApiResponse({ status: 422, description: 'Validation failed or role limit reached' })
  create(@Body() dto: CreateRoleDto, @Req() req: Request) {
    return this.roles.create(dto, parseAcceptLanguage(req.headers['accept-language']));
  }

  @Patch(':key')
  @RateLimit(30)
  @RequireCapability('manageRoles')
  @ApiOperation({
    summary: 'Edit a custom role, or customise a system role (SUPER_ADMIN is read-only)',
  })
  @ApiResponse({ status: 200, description: 'The updated RoleDto' })
  @ApiResponse({ status: 403, description: 'Escalation or read-only role' })
  @ApiResponse({ status: 404, description: 'Unknown role' })
  @ApiResponse({ status: 422, description: 'Locked admin capabilities or invalid input' })
  update(@Param('key') key: string, @Body() dto: UpdateRoleDto, @Req() req: Request) {
    return this.roles.update(key, dto, parseAcceptLanguage(req.headers['accept-language']));
  }

  @Delete(':key')
  @RateLimit(30)
  @RequireCapability('manageRoles')
  @ApiOperation({ summary: 'Delete a custom role, or reset a system role to its defaults' })
  @ApiResponse({ status: 200, description: '{ success: true }' })
  @ApiResponse({ status: 409, description: 'Role is assigned to members or pending invitations' })
  remove(@Param('key') key: string) {
    return this.roles.remove(key);
  }
}

@ApiTags('roles')
@ApiBearerAuth()
@Controller('memberships')
@UseGuards(JwtAuthGuard, RolesGuard)
export class MembershipRoleController {
  constructor(private readonly roles: RolesService) {}

  @Patch(':id/role')
  @RateLimit(30)
  @RequireCapability('manageStaff')
  @ApiOperation({ summary: 'Assign a system or custom role to a member of the active clinic' })
  @ApiResponse({ status: 200, description: '{ membershipId, roleKey, role, roleId }' })
  @ApiResponse({ status: 403, description: 'Own role, super admin, or capability escalation' })
  @ApiResponse({ status: 404, description: 'Membership or role not found in this clinic' })
  assign(@Param('id') id: string, @Body() dto: AssignRoleDto) {
    return this.roles.assign(id, dto);
  }
}
