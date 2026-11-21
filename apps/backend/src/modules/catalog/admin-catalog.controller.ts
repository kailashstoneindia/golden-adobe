import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
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
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { AdminCatalogService } from './admin-catalog.service';
import { ProductReadinessService } from './product-readiness.service';
import { ProductMergeService } from './product-merge.service';
import { MergeProductDto } from './dto/merge-product.dto';
import { LookupProductKeysDto } from './dto/lookup-product-keys.dto';
import { ListProductsQueryDto } from './dto/list-products-query.dto';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { BulkPublishProductsDto } from './dto/bulk-publish-products.dto';
import {
  CreateHsnCodeDto,
  ListHsnCodesQueryDto,
  SetCategoryHsnDefaultDto,
} from './dto/hsn-code.dto';

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
  constructor(
    private readonly adminCatalog: AdminCatalogService,
    private readonly readiness: ProductReadinessService,
    private readonly merger: ProductMergeService,
  ) {}

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

  @Patch('categories/:categoryId')
  @ApiOperation({
    summary: "Set or clear a category's default HSN code",
    description:
      'A product created in this category (or a sub-category without its own default) with no ' +
      'HSN code gets this one and its GST rate (decision 0063).',
  })
  async setCategoryHsnDefault(
    @Param('categoryId', ParseUUIDPipe) categoryId: string,
    @Body() dto: SetCategoryHsnDefaultDto,
  ) {
    return this.adminCatalog.setCategoryHsnDefault(categoryId, dto.hsnCodeDefault);
  }

  @Get('hsn-codes')
  @ApiOperation({ summary: 'Search HSN codes by code prefix or description (up to 50)' })
  async hsnCodes(@Query() query: ListHsnCodesQueryDto) {
    return this.adminCatalog.listHsnCodes(query.search);
  }

  @Post('hsn-codes')
  @ApiOperation({ summary: 'Add an HSN code with its GST rate' })
  async createHsnCode(@Body() dto: CreateHsnCodeDto) {
    return this.adminCatalog.createHsnCode(dto);
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

  @Post('products/lookup-codes')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Match product codes or part numbers to products (bulk image upload)',
    description:
      'A code wins over a part number; a part number used by several brands is listed under ' +
      'ambiguousKeys unless brandId is given. Keys that match nothing are left out (decision 0063).',
  })
  async lookupProductKeys(@Body() dto: LookupProductKeysDto) {
    return this.adminCatalog.lookupProductKeys(dto);
  }

  @Get('products/:productId/readiness')
  @ApiOperation({
    summary: 'What the product still needs before it can go live',
    description:
      'Blocking checks (an image, the required attributes) stop publishing; the HSN code and a ' +
      'vendor listing are warnings (decision 0063).',
  })
  async productReadiness(@Param('productId', ParseUUIDPipe) productId: string) {
    return this.readiness.getReadiness(productId);
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

  @Patch('products/bulk-publish')
  @ApiOperation({
    summary: 'Publish many draft products at once (draft → live)',
    description:
      'Selects by explicit productIds, OR by categoryId/brandId (draft products only, ' +
      'the two ANDed if both given) — combining productIds with a filter is rejected as ' +
      'ambiguous rather than merged. Per-row error collection — one product tripping the ' +
      'required-variant-attributes trigger does not block the rest from publishing. ' +
      'Declared before products/:productId — Express/Nest route matching is order-' +
      'sensitive for same-depth static-vs-param segments, and this one must win.',
  })
  async bulkPublish(@Body() dto: BulkPublishProductsDto) {
    return this.adminCatalog.bulkPublish(dto);
  }

  @Patch('products/:productId')
  @ApiOperation({
    summary: 'Edit a product (any field except its category)',
    description:
      'Category is not editable here — a category change alters the entire effective ' +
      'attribute set and is a re-classification, not a correction (decision 0023). ' +
      'attributeValues, when present, fully replaces the existing set.',
  })
  async updateProduct(
    @Param('productId', ParseUUIDPipe) productId: string,
    @Body() dto: UpdateProductDto,
    @CurrentUser('sub') adminUserId: string,
  ) {
    return this.adminCatalog.updateProduct(productId, adminUserId, dto);
  }

  @Patch('products/:productId/retire')
  @ApiOperation({
    summary: 'Retire a product',
    description:
      'Status becomes deprecated and every active vendor listing is paused (decision 0063).',
  })
  async retireProduct(
    @Param('productId', ParseUUIDPipe) productId: string,
    @CurrentUser('sub') adminUserId: string,
  ) {
    return this.adminCatalog.retireProduct(productId, adminUserId);
  }

  @Post('products/:productId/merge')
  @ApiOperation({
    summary: 'Merge this product into another (same category)',
    description:
      'Listings, vendor SKU mappings and (if the target has none) images move to the target; a ' +
      'vendor who lists both keeps the target listing and the source one is paused, never deleted. ' +
      'This product is retired and points at the target (decision 0063).',
  })
  async mergeProduct(
    @Param('productId', ParseUUIDPipe) productId: string,
    @Body() dto: MergeProductDto,
    @CurrentUser('sub') adminUserId: string,
  ) {
    return this.merger.merge(adminUserId, productId, dto.intoProductId);
  }

  @Patch('products/:productId/restore')
  @ApiOperation({ summary: 'Bring a retired product back as a draft' })
  async restoreProduct(
    @Param('productId', ParseUUIDPipe) productId: string,
    @CurrentUser('sub') adminUserId: string,
  ) {
    return this.adminCatalog.restoreProduct(productId, adminUserId);
  }

  @Delete('products/:productId')
  @HttpCode(204)
  @ApiOperation({
    summary: 'Delete a draft product',
    description:
      'Only a draft with no vendor listing, order or import row; anything else answers 409 ' +
      '"retire it instead". Its images and their stored files are removed too.',
  })
  async deleteProduct(
    @Param('productId', ParseUUIDPipe) productId: string,
    @CurrentUser('sub') adminUserId: string,
  ) {
    await this.adminCatalog.deleteProduct(productId, adminUserId);
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
