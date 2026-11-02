import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
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
    return this.checkoutService.checkout(req.user.sub, dto.deliveryAddressId, dto.bookingId);
  }

  @Get('orders')
  listOrders(@Req() req: any) {
    return this.ordersService.listForCustomer(req.user.sub);
  }

  // Method-level @Roles() override: the owning customer OR the owning
  // artisan (via the order's bookingId attribution, decision 0045) may
  // read this order's detail. Closes the gap where an artisan could see
  // an order's id (HireRequestsController's listAttributedOrders) but had
  // nowhere to open it — the class-level CUSTOMER-only gate otherwise
  // blocked every artisan caller before the handler even ran.
  @Get('orders/:id')
  @Roles(Role.CUSTOMER, Role.ARTISAN)
  @ApiOperation({ summary: "Read one order's detail" })
  @ApiResponse({ status: 200, description: 'The order' })
  @ApiResponse({
    status: 404,
    description: 'Not found, or not owned by the caller (as customer or attributed artisan)',
  })
  getOrder(@Req() req: any, @Param('id', ParseUUIDPipe) id: string) {
    return this.ordersService.getForOwner(req.user.sub, req.user.role, id);
  }

  @Patch('orders/:id/cancel')
  cancelOrder(@Req() req: any, @Param('id') id: string) {
    return this.ordersService.cancel(req.user.sub, id);
  }
}
