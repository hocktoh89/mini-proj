import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Put,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser, RequirePermissions } from '../auth/auth.decorators';
import { USER_ROLES_ASSIGN } from './access-control.permissions';
import { AccessControlService } from './access-control.service';
import { AssignRoleDto } from './dto/assign-role.dto';

@ApiTags('access-control')
@ApiBearerAuth()
@RequirePermissions(USER_ROLES_ASSIGN)
@Controller('users')
export class UserRolesController {
  constructor(private readonly accessControl: AccessControlService) {}

  @Get()
  list() {
    return this.accessControl.listUsers();
  }

  // Takes effect on the user's next request; no re-login needed.
  @Put(':id/role')
  assignRole(
    @CurrentUser() actor: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AssignRoleDto,
  ) {
    return this.accessControl.assignRole(actor.id, id, dto);
  }

  @Delete(':id/role')
  @HttpCode(HttpStatus.NO_CONTENT)
  removeRole(@CurrentUser() actor: AuthUser, @Param('id', ParseIntPipe) id: number) {
    return this.accessControl.removeRole(actor.id, id);
  }
}
