import { Body, Controller, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '@golden-abode/types';
import { CheckoutService } from './checkout.service';
import { OrdersService } from './orders.service';
import { CheckoutDto } from './dto/checkout.dto';

@ApiTags('Orders')
@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.CUSTOMER)
@ApiBearerAuth()
export class OrdersController {
  constructor(
    private readonly checkoutService: CheckoutService,
    private readonly ordersService: OrdersService,
  ) {}

  @Post('checkout')
  checkout(@Req() req: any, @Body() dto: CheckoutDto) {
    return this.checkoutService.checkout(req.user.sub, dto.deliveryAddressId);
  }

  @Get('orders')
  listOrders(@Req() req: any) {
    return this.ordersService.listForCustomer(req.user.sub);
  }

  @Get('orders/:id')
  getOrder(@Req() req: any, @Param('id') id: string) {
    return this.ordersService.getForCustomer(req.user.sub, id);
  }

  @Patch('orders/:id/cancel')
  cancelOrder(@Req() req: any, @Param('id') id: string) {
    return this.ordersService.cancel(req.user.sub, id);
  }
}
