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
  Put,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@golden-abode/types';
import type { Response } from 'express';

import { Roles } from '../../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { ConfirmMediaDto } from './dto/confirm-media.dto';
import { CreateMediaUploadDto } from './dto/create-media-upload.dto';
import { ReorderMediaDto } from './dto/reorder-media.dto';
import { UpdateMediaDto } from './dto/update-media.dto';
import { MediaService } from './media.service';

// Product images (decision 0033). Admin only: vendors never upload images
// (ADR 0009). The upload itself goes browser -> S3 and never touches this API:
// POST uploads issues the ticket, the browser sends the file to S3, then
// POST (confirm) records it.
@ApiTags('Admin Catalog Media')
@Controller('admin/catalog/products/:productId/media')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
@ApiBearerAuth()
export class AdminMediaController {
  constructor(private readonly media: MediaService) {}

  @Get()
  @ApiOperation({ summary: "A product's images in display order, with processing status" })
  list(@Param('productId', ParseUUIDPipe) productId: string) {
    return this.media.list(productId);
  }

  @Post('uploads')
  @ApiOperation({
    summary: 'Step 1: get a presigned S3 upload ticket',
    description:
      'Returns a URL and form fields for a direct browser upload to S3. S3 itself enforces ' +
      'the size limit and content type. Send every field in order, with the file LAST.',
  })
  createUpload(
    @Param('productId', ParseUUIDPipe) productId: string,
    @Body() dto: CreateMediaUploadDto,
  ) {
    return this.media.createUpload(productId, dto);
  }

  @Post()
  @ApiOperation({
    summary: 'Step 3: confirm an upload and attach it to the product',
    description:
      'Verifies the stored file (size, type, magic bytes) and records it as "processing". ' +
      'Safe to retry: 201 the first time, 200 on a repeat.',
  })
  async confirm(
    @Param('productId', ParseUUIDPipe) productId: string,
    @Body() dto: ConfirmMediaDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { item, created } = await this.media.confirm(productId, dto);
    res.status(created ? 201 : 200);
    return item;
  }

  // Declared before ':mediaId' so "order" is never read as an id.
  @Put('order')
  @ApiOperation({ summary: 'Reorder images: send every media id once, in the new order' })
  reorder(@Param('productId', ParseUUIDPipe) productId: string, @Body() dto: ReorderMediaDto) {
    return this.media.reorder(productId, dto);
  }

  @Patch(':mediaId')
  @ApiOperation({ summary: 'Set the primary image or the representative flag' })
  update(
    @Param('productId', ParseUUIDPipe) productId: string,
    @Param('mediaId', ParseUUIDPipe) mediaId: string,
    @Body() dto: UpdateMediaDto,
  ) {
    return this.media.update(productId, mediaId, dto);
  }

  @Delete(':mediaId')
  @HttpCode(204)
  @ApiOperation({ summary: 'Delete an image and its stored files' })
  async remove(
    @Param('productId', ParseUUIDPipe) productId: string,
    @Param('mediaId', ParseUUIDPipe) mediaId: string,
  ) {
    await this.media.remove(productId, mediaId);
  }

  @Post(':mediaId/reprocess')
  @HttpCode(202)
  @ApiOperation({ summary: 'Retry variant generation for a failed image' })
  reprocess(
    @Param('productId', ParseUUIDPipe) productId: string,
    @Param('mediaId', ParseUUIDPipe) mediaId: string,
  ) {
    return this.media.reprocess(productId, mediaId);
  }
}
