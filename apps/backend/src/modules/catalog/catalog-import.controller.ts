import { Controller, Get, Param, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { Role } from '@golden-abode/types';

import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CatalogImportTemplateService } from './catalog-import-template.service';

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
  constructor(private readonly templateService: CatalogImportTemplateService) {}

  // Uploads moved to CatalogImportJobsController (decision 0063): they run in
  // the background now.

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
}
