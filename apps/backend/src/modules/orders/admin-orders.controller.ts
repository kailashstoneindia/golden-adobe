import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@golden-abode/types';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { OrdersService } from './orders.service';

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
  constructor(private readonly ordersService: OrdersService) {}

  @Get()
  list() {
    return this.ordersService.listForAdmin();
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.ordersService.getForAdmin(id);
  }
}
