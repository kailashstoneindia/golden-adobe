import { Body, Controller, Delete, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '@golden-abode/types';
import { CustomersService } from './customers.service';
import { UpdateCustomerProfileDto } from './dto/update-customer-profile.dto';
import { UpsertCustomerAddressDto } from './dto/upsert-customer-address.dto';

// Guards at class level, matching VendorsController's convention — every
// route here is customer-only.
@ApiTags('Customers')
@Controller('customers')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.CUSTOMER)
@ApiBearerAuth()
export class CustomersController {
  constructor(private readonly customersService: CustomersService) {}

  @Get('me')
  getProfile(@Req() req: any) {
    return this.customersService.getProfile(req.user.sub);
  }

  @Patch('me')
  updateProfile(@Req() req: any, @Body() dto: UpdateCustomerProfileDto) {
    return this.customersService.updateProfile(req.user.sub, dto);
  }

  @Get('me/addresses')
  listAddresses(@Req() req: any) {
    return this.customersService.listAddresses(req.user.sub);
  }

  @Post('me/addresses')
  addAddress(@Req() req: any, @Body() dto: UpsertCustomerAddressDto) {
    return this.customersService.addAddress(req.user.sub, dto);
  }

  @Patch('me/addresses/:id')
  updateAddress(@Req() req: any, @Param('id') id: string, @Body() dto: UpsertCustomerAddressDto) {
    return this.customersService.updateAddress(req.user.sub, id, dto);
  }

  @Delete('me/addresses/:id')
  deleteAddress(@Req() req: any, @Param('id') id: string) {
    return this.customersService.deleteAddress(req.user.sub, id);
  }
}
