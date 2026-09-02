import { Controller, Get, Param, Patch, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@golden-abode/types';

import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { AdminCatalogService } from './admin-catalog.service';
import { ListProductsQueryDto } from './dto/list-products-query.dto';

// Read + publish surface for the admin panel's catalog screens.
//
// Deliberately NOT product create/edit: bulk seeding goes through Phase 3's
// generated Excel templates (admin/catalog-import), and vendor-requested
// products come through the review queue. A single-product form is a useful
// later addition for corrections, not a prerequisite for operating the
// catalog.
@ApiTags('Admin Catalog')
@Controller('admin/catalog')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
@ApiBearerAuth()
export class AdminCatalogController {
  constructor(private readonly adminCatalog: AdminCatalogService) {}

  @Get('categories')
  @ApiOperation({
    summary: 'The full category tree',
    description:
      "All 8 top-level categories through to the 58 leaves, with each node's product counts. " +
      'Products may only attach to leaves, so the import screen offers leaf nodes only.',
  })
  async categories() {
    return this.adminCatalog.listCategoryTree();
  }

  @Get('categories/:categoryId/attributes')
  @ApiOperation({
    summary: "A category's effective attribute set",
    description:
      'Global + inherited + own attributes, resolved through the same ancestry walk as ' +
      'attributes_flat and the import template generator — so what this shows is what a ' +
      'template for that category will contain.',
  })
  async categoryAttributes(@Param('categoryId') categoryId: string) {
    return this.adminCatalog.listCategoryAttributes(categoryId);
  }

  @Get('products')
  @ApiOperation({
    summary: 'List catalog products across every status',
    description:
      'Includes drafts, which have no vendor listing and therefore no search document — ' +
      'Meilisearch structurally cannot represent them, so this reads Postgres directly ' +
      '(decision 0019).',
  })
  async products(@Query() query: ListProductsQueryDto) {
    return this.adminCatalog.listProducts(query);
  }

  @Get('products/:productId')
  @ApiOperation({
    summary: 'One product with its attribute values, media and live listing count',
  })
  async product(@Param('productId') productId: string) {
    return this.adminCatalog.getProduct(productId);
  }

  @Patch('products/:productId/publish')
  @ApiOperation({
    summary: 'Publish a draft product (draft → live)',
    description:
      'Subject to the same DB guards as any other publish: the required-variant-attributes ' +
      'trigger rejects a product whose identity depends on attributes that are still blank ' +
      '(Phase 7 risk 3), naming the specific missing attribute.',
  })
  async publish(@Param('productId') productId: string) {
    return this.adminCatalog.setProductStatus(productId, 'live');
  }

  @Patch('products/:productId/unpublish')
  @ApiOperation({
    summary: 'Withdraw a live product (live → draft)',
    description:
      'Its search documents are removed by the outbox on the next drain — the product stops ' +
      'being findable without any listing being deleted.',
  })
  async unpublish(@Param('productId') productId: string) {
    return this.adminCatalog.setProductStatus(productId, 'draft');
  }
}
