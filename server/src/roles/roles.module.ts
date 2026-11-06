import { Module } from '@nestjs/common';
import { MembershipRoleController, RolesController } from './roles.controller';
import { RolesService } from './roles.service';

@Module({
  controllers: [RolesController, MembershipRoleController],
  providers: [RolesService],
  exports: [RolesService],
})
export class RolesModule {}
