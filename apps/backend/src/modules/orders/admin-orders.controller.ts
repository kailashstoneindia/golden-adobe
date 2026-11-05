import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { Role } from '@golden-abode/types';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { OrdersService } from './orders.service';
import { RefundsService } from './refunds.service';
import { AdminOverrideGroupStatusDto } from './dto/admin-override-group-status.dto';
import { AdminRefundDto } from './dto/admin-refund.dto';
import { AdminOrdersQueryDto } from './dto/admin-orders-query.dto';
import { RefundStatus } from './models/refund.model';

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
  list(@Query() query: AdminOrdersQueryDto) {
    return this.ordersService.listForAdmin(query.customerId);
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
  @ApiResponse({ status: 202, description: 'Refund recorded but not yet confirmed by Razorpay' })
  @ApiResponse({
    status: 400,
    description: 'Refund not allowed, or Razorpay rejected or reported it as failed',
  })
  async refund(
    @Param('id') id: string,
    @Body() dto: AdminRefundDto,
    @CurrentUser('sub') adminUserId: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const refund = await this.refundsService.requestRefund({
      orderId: id,
      adminUserId,
      reason: dto.reason,
      amountPaise: dto.amountPaise,
      vendorGroupId: dto.vendorGroupId,
    });
    // The row is kept (failed, and retryable); the order has already followed it.
    if (refund.status === RefundStatus.FAILED) {
      throw new BadRequestException('Razorpay reported this refund as failed.');
    }
    // Still requested: Razorpay's answer is not confirmed and the sync job
    // will settle it, so the client must not treat this as a failure or resubmit.
    if (refund.status === RefundStatus.REQUESTED) {
      res.status(HttpStatus.ACCEPTED);
    }
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
