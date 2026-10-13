import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../auth/auth.decorators';
import { API_CLIENTS_MANAGE } from '../catalog/catalog.permissions';
import { ApiClientsService } from './api-clients.service';
import { CreateApiClientDto } from './dto/create-api-client.dto';
import { UpdateApiClientDto } from './dto/update-api-client.dto';

@ApiTags('api-clients')
@ApiBearerAuth()
@RequirePermissions(API_CLIENTS_MANAGE)
@Controller('api-clients')
export class ApiClientsController {
  constructor(private readonly apiClients: ApiClientsService) {}

  @Get()
  list() {
    return this.apiClients.list();
  }

  @Post()
  create(@Body() dto: CreateApiClientDto) {
    return this.apiClients.create(dto);
  }

  @Patch(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateApiClientDto) {
    return this.apiClients.update(id, dto);
  }

  @Post(':id/rotate-key')
  rotateKey(@Param('id', ParseIntPipe) id: number) {
    return this.apiClients.rotateKey(id);
  }
}
