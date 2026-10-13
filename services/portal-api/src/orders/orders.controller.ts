import { Body, Controller, Post, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiConflictResponse, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { bearerFrom } from '../vendor-erp/vendor-erp.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { OrdersService } from './orders.service';

@ApiTags('orders')
@ApiBearerAuth()
@Controller('orders')
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  @ApiConflictResponse({ description: 'Quantity exceeds the available stock' })
  @Post()
  create(@Req() request: Request, @Body() dto: CreateOrderDto) {
    return this.orders.create(bearerFrom(request), dto);
  }
}
