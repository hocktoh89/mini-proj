import { Body, Controller, Post, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiConflictResponse, ApiSecurity, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { credentialsFrom } from '../vendor-erp/vendor-erp.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { OrdersService } from './orders.service';

@ApiTags('orders')
@ApiSecurity('api-key')
@ApiBearerAuth()
@Controller('orders')
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  @ApiConflictResponse({ description: 'Quantity exceeds the available stock' })
  @Post()
  create(@Req() request: Request, @Body() dto: CreateOrderDto) {
    return this.orders.create(credentialsFrom(request), dto);
  }
}
