import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
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
import {
  AddBrandAliasDto,
  ConfirmBrandLogoDto,
  CreateBrandLogoUploadDto,
  SetBrandActiveDto,
  UpdateBrandDto,
} from './dto/update-brand.dto';

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

  @Patch(':id')
  @ApiOperation({
    summary: 'Edit a brand',
    description:
      'Name and compliance fields. The slug never changes. A merged brand cannot be edited.',
  })
  async update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateBrandDto) {
    return this.brands.update(id, dto);
  }

  @Patch(':id/active')
  @ApiOperation({
    summary: 'Activate or deactivate a brand',
    description:
      'A deactivated brand is refused on import and add-product; its existing products are untouched.',
  })
  async setActive(@Param('id', ParseUUIDPipe) id: string, @Body() dto: SetBrandActiveDto) {
    return this.brands.setActive(id, dto.isActive);
  }

  @Post(':id/aliases')
  @ApiOperation({ summary: 'Teach another spelling of this brand' })
  async addAlias(@Param('id', ParseUUIDPipe) id: string, @Body() dto: AddBrandAliasDto) {
    return this.brands.addAlias(id, dto.alias);
  }

  @Delete(':id/aliases/:aliasId')
  @ApiOperation({ summary: 'Remove one of this brand’s aliases' })
  async removeAlias(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('aliasId', ParseUUIDPipe) aliasId: string,
  ) {
    return this.brands.removeAlias(id, aliasId);
  }

  @Post(':id/logo-upload-url')
  @ApiOperation({
    summary: 'Get a presigned upload for the brand logo',
    description:
      'JPEG, PNG or WebP up to 2 MB. Upload to the returned URL, then call logo/confirm with the key.',
  })
  async createLogoUploadUrl(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateBrandLogoUploadDto,
  ) {
    return this.brands.createLogoUploadUrl(id, dto.contentType);
  }

  @Post(':id/logo/confirm')
  @ApiOperation({ summary: 'Set the brand logo once its upload has finished' })
  async confirmLogo(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ConfirmBrandLogoDto) {
    return this.brands.confirmLogo(id, dto.key);
  }
}
