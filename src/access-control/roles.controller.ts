import { Body, Controller, Get, Param, Patch, Post, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser, RequirePermissions } from '../auth/auth.decorators';
import { ROLES_MANAGE } from './access-control.permissions';
import { AccessControlService } from './access-control.service';
import { CreateRoleDto } from './dto/create-role.dto';
import { SetRolePermissionsDto } from './dto/set-role-permissions.dto';
import { UpdateRoleDto } from './dto/update-role.dto';

@ApiTags('access-control')
@ApiBearerAuth()
@RequirePermissions(ROLES_MANAGE)
@Controller()
export class RolesController {
  constructor(private readonly accessControl: AccessControlService) {}

  @Get('permissions')
  listPermissions() {
    return this.accessControl.listPermissions();
  }

  @Get('roles')
  listRoles() {
    return this.accessControl.listRoles();
  }

  @Post('roles')
  createRole(@CurrentUser() actor: AuthUser, @Body() dto: CreateRoleDto) {
    return this.accessControl.createRole(actor.id, dto);
  }

  @Patch('roles/:code')
  updateRole(
    @CurrentUser() actor: AuthUser,
    @Param('code') code: string,
    @Body() dto: UpdateRoleDto,
  ) {
    return this.accessControl.updateRole(actor.id, code, dto);
  }

  @Put('roles/:code/permissions')
  setPermissions(
    @CurrentUser() actor: AuthUser,
    @Param('code') code: string,
    @Body() dto: SetRolePermissionsDto,
  ) {
    return this.accessControl.setRolePermissions(actor.id, code, dto.permissionCodes);
  }
}
