import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../auth/auth.decorators';
import { CreateNodeDto } from './dto/create-node.dto';
import { CreateOrganizationDto } from './dto/create-organization.dto';
import { NameDto } from './dto/name.dto';
import { UpdateNodeDto } from './dto/update-node.dto';
import { HIERARCHY_MANAGE } from './hierarchy.permissions';
import { HierarchyService } from './hierarchy.service';

@ApiTags('hierarchy')
@ApiBearerAuth()
@RequirePermissions(HIERARCHY_MANAGE)
@Controller()
export class HierarchyController {
  constructor(private readonly hierarchy: HierarchyService) {}

  @Get('organizations')
  listOrganizations() {
    return this.hierarchy.listOrganizations();
  }

  @Post('organizations')
  createOrganization(@Body() dto: CreateOrganizationDto) {
    return this.hierarchy.createOrganization(dto);
  }

  @Patch('organizations/:id')
  renameOrganization(@Param('id', ParseIntPipe) id: number, @Body() dto: NameDto) {
    return this.hierarchy.renameOrganization(id, dto.name);
  }

  @Delete('organizations/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteOrganization(@Param('id', ParseIntPipe) id: number) {
    return this.hierarchy.deleteOrganization(id);
  }

  @Get('organizations/:id/tree')
  getTree(@Param('id', ParseIntPipe) id: number) {
    return this.hierarchy.getTree(id);
  }

  // Appends a level below the current bottom one.
  @Post('organizations/:id/levels')
  addLevel(@Param('id', ParseIntPipe) id: number, @Body() dto: NameDto) {
    return this.hierarchy.addLevel(id, dto.name);
  }

  @Patch('levels/:id')
  renameLevel(@Param('id', ParseIntPipe) id: number, @Body() dto: NameDto) {
    return this.hierarchy.renameLevel(id, dto.name);
  }

  @Delete('levels/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteLevel(@Param('id', ParseIntPipe) id: number) {
    return this.hierarchy.deleteLevel(id);
  }

  @Post('nodes')
  createNode(@Body() dto: CreateNodeDto) {
    return this.hierarchy.createNode(dto);
  }

  @Patch('nodes/:id')
  updateNode(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateNodeDto) {
    return this.hierarchy.updateNode(id, dto);
  }

  @Delete('nodes/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteNode(@Param('id', ParseIntPipe) id: number) {
    return this.hierarchy.deleteNode(id);
  }
}
