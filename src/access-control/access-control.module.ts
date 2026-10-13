import { Module } from '@nestjs/common';
import { AccessControlService } from './access-control.service';
import { RolesController } from './roles.controller';
import { UserRolesController } from './user-roles.controller';

@Module({
  controllers: [RolesController, UserRolesController],
  providers: [AccessControlService],
  exports: [AccessControlService],
})
export class AccessControlModule {}
