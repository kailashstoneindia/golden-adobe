import {
  BadRequestException,
  Controller,
  Get,
  Param,
  Post,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { Role } from '@golden-abode/types';

import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CatalogImportTemplateService } from './catalog-import-template.service';
import { CatalogImportUploadService } from './catalog-import-upload.service';

const XLSX_MIME_TYPES = new Set([
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/octet-stream', // some browsers/proxies mislabel .xlsx as this
]);

// Phase 3 — admin catalog import (Flow 1, catalog-excel-flows.md).
// Deliberately NOT under /admin/catalog-import as a sub-route of
// AdminController — this is a distinct feature area with its own file
// upload concern, mirroring how CatalogModule already stands apart from
// AdminModule for the schema itself.
@ApiTags('Catalog Import')
@Controller('admin/catalog-import')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
@ApiBearerAuth()
export class CatalogImportController {
  constructor(
    private readonly templateService: CatalogImportTemplateService,
    private readonly uploadService: CatalogImportUploadService,
  ) {}

  @Get('template/:categoryId')
  @ApiOperation({
    summary: 'Generate an Excel import template for a leaf category',
    description:
      "Columns are the category's effective attribute set (global + inherited + leaf), resolved through the same inheritance rule as attributes_flat. Required columns are starred and highlighted; enum attributes get an in-cell dropdown.",
  })
  async downloadTemplate(@Param('categoryId') categoryId: string, @Res() res: Response) {
    const { buffer, filename } = await this.templateService.generate(categoryId);

    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}"`,
    });
    res.send(buffer);
  }

  @Post(':categoryId')
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: 'Upload a completed import template',
    description:
      'Validates every row (required columns, enum values, numeric parsing, brand resolution, dedup against existing products). Rows that pass land as draft master_product rows — publishing is a separate step. Rows that fail are returned as an error-annotated workbook plus a structured error list; nothing is written for a rejected row.',
  })
  async upload(@Param('categoryId') categoryId: string, @UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('file is required (multipart field name: "file")');
    }
    if (!XLSX_MIME_TYPES.has(file.mimetype)) {
      throw new BadRequestException(`expected an .xlsx file, got mimetype "${file.mimetype}"`);
    }

    return this.uploadService.importFile(categoryId, file.buffer);
  }
}
