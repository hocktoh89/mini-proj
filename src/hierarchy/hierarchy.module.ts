import { Module } from '@nestjs/common';
import { AccessControlModule } from '../access-control/access-control.module';
import { HierarchyController } from './hierarchy.controller';
import { HierarchyService } from './hierarchy.service';
import { UserHierarchyController } from './user-hierarchy.controller';

@Module({
  imports: [AccessControlModule],
  controllers: [HierarchyController, UserHierarchyController],
  providers: [HierarchyService],
})
export class HierarchyModule {}
