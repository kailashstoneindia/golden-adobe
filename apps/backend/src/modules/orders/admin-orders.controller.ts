import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@golden-abode/types';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { OrdersService } from './orders.service';
import { RefundsService } from './refunds.service';
import { AdminOverrideGroupStatusDto } from './dto/admin-override-group-status.dto';
import { AdminRefundDto } from './dto/admin-refund.dto';

// Declared in OrdersModule, not AdminModule — it needs OrdersService, which
// OrdersModule already owns, and AdminCatalogController sets the same
// precedent (declared in CatalogModule rather than AdminModule) for the
// same reason: the controller lives with the service it depends on, not
// with a route-prefix convention.
@ApiTags('Admin Orders')
@Controller('admin/orders')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
@ApiBearerAuth()
export class AdminOrdersController {
  constructor(
    private readonly ordersService: OrdersService,
    private readonly refundsService: RefundsService,
  ) {}

  @Get()
  list() {
    return this.ordersService.listForAdmin();
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.ordersService.getForAdmin(id);
  }

  @Get(':id/payment-events')
  getPaymentEvents(@Param('id') id: string) {
    return this.ordersService.getPaymentEvents(id);
  }

  @Get(':id/refunds')
  listRefunds(@Param('id') id: string) {
    return this.refundsService.listForOrder(id);
  }

  @Post(':id/refund')
  @HttpCode(HttpStatus.OK)
  async refund(
    @Param('id') id: string,
    @Body() dto: AdminRefundDto,
    @CurrentUser('sub') adminUserId: string,
  ) {
    await this.refundsService.requestRefund({
      orderId: id,
      adminUserId,
      reason: dto.reason,
      amountPaise: dto.amountPaise,
      vendorGroupId: dto.vendorGroupId,
    });
    return this.ordersService.getForAdmin(id);
  }

  @Patch(':id/cancel')
  @HttpCode(HttpStatus.OK)
  cancel(@Param('id') id: string) {
    return this.ordersService.adminCancel(id);
  }

  @Patch('vendor-group/:groupId/override-status')
  @HttpCode(HttpStatus.OK)
  overrideGroupStatus(@Param('groupId') groupId: string, @Body() dto: AdminOverrideGroupStatusDto) {
    return this.ordersService.adminOverrideVendorGroupStatus(groupId, dto.status, dto.reason);
  }
}
