import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@golden-abode/types';

import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { AdminCatalogService } from './admin-catalog.service';
import { ListProductsQueryDto } from './dto/list-products-query.dto';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';

// Read + publish + create/edit surface for the admin panel's catalog
// screens. Bulk seeding still goes through Phase 3's generated Excel
// templates (admin/catalog-import) and vendor-requested products still come
// through the review queue — create/edit here (decision 0023) is for
// one-off corrections and additions, not a replacement for either.
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

  @Post('products')
  @ApiOperation({
    summary: 'Create a single product',
    description:
      'For one-off corrections and additions outside a bulk import — the same effective ' +
      'attribute set as GET categories/:id/attributes, validated the same way (enum ' +
      'membership, numeric parse). Created as draft; variant-defining attributes may be left ' +
      'blank until publish, where the DB trigger enforces them by name (decision 0023).',
  })
  async createProduct(@Body() dto: CreateProductDto) {
    return this.adminCatalog.createProduct(dto);
  }

  @Patch('products/:productId')
  @ApiOperation({
    summary: "Edit a product's name and/or attribute values",
    description:
      'Category is not editable here — a category change alters the entire effective ' +
      'attribute set and is a re-classification, not a correction (decision 0023). ' +
      'attributeValues, when present, fully replaces the existing set.',
  })
  async updateProduct(@Param('productId') productId: string, @Body() dto: UpdateProductDto) {
    return this.adminCatalog.updateProduct(productId, dto);
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
