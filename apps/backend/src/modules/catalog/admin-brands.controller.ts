import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@golden-abode/types';

import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { AdminBrandsService } from './admin-brands.service';
import { CreateBrandDto } from './dto/create-brand.dto';
import { ListBrandsQueryDto } from './dto/list-brands-query.dto';

// Decision 0063: brand management from the admin panel, so onboarding a new
// brand no longer needs a developer and a seed script.
@ApiTags('Admin Brands')
@Controller('admin/brands')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
@ApiBearerAuth()
export class AdminBrandsController {
  constructor(private readonly brands: AdminBrandsService) {}

  @Get()
  @ApiOperation({ summary: 'List brands, with product counts and aliases' })
  async list(@Query() query: ListBrandsQueryDto) {
    return this.brands.list(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'One brand with its aliases' })
  async get(@Param('id', ParseUUIDPipe) id: string) {
    return this.brands.get(id);
  }

  @Post()
  @ApiOperation({
    summary: 'Create a brand',
    description:
      'All four compliance fields are required. A name that matches an existing brand after ' +
      'normalisation (case, "Ltd", "India" and similar suffixes) or an existing alias is refused with 409.',
  })
  async create(@Body() dto: CreateBrandDto) {
    return this.brands.create(dto);
  }
}
