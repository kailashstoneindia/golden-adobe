import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '@golden-abode/types';
import { CheckoutService } from './checkout.service';
import { CheckoutDto } from './dto/checkout.dto';

@ApiTags('Orders')
@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.CUSTOMER)
@ApiBearerAuth()
export class OrdersController {
  constructor(private readonly checkoutService: CheckoutService) {}

  @Post('checkout')
  checkout(@Req() req: any, @Body() dto: CheckoutDto) {
    return this.checkoutService.checkout(req.user.sub, dto.deliveryAddressId);
  }
}
