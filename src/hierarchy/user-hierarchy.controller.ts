import { Body, Controller, Get, Param, ParseIntPipe, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser, RequirePermissions } from '../auth/auth.decorators';
import { SetUserHierarchyDto } from './dto/set-user-hierarchy.dto';
import { USER_HIERARCHY_ASSIGN } from './hierarchy.permissions';
import { HierarchyService } from './hierarchy.service';

@ApiTags('hierarchy')
@ApiBearerAuth()
@RequirePermissions(USER_HIERARCHY_ASSIGN)
@Controller('users')
export class UserHierarchyController {
  constructor(private readonly hierarchy: HierarchyService) {}

  @Get(':id/hierarchy')
  get(@Param('id', ParseIntPipe) id: number) {
    return this.hierarchy.getUserHierarchy(id);
  }

  @Put(':id/hierarchy')
  set(
    @CurrentUser() actor: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: SetUserHierarchyDto,
  ) {
    return this.hierarchy.setUserHierarchy(actor.id, id, dto);
  }
}
