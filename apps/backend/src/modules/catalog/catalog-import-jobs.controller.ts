import {
  BadRequestException,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiConsumes,
  ApiOperation,
  ApiPropertyOptional,
  ApiTags,
} from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { Role } from '@golden-abode/types';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CatalogImportJobsService } from './catalog-import-jobs.service';

const MAX_IMPORT_BYTES = 20 * 1024 * 1024;
const XLSX_MIME_TYPES = new Set([
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/octet-stream', // some browsers/proxies mislabel .xlsx as this
]);

class ListImportJobsQueryDto {
  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ default: 25, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

// Decision 0063: the admin product import as background jobs. The template
// download stays on CatalogImportController.
@ApiTags('Catalog Import')
@Controller('admin/catalog-import')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
@ApiBearerAuth()
export class CatalogImportJobsController {
  constructor(private readonly jobs: CatalogImportJobsService) {}

  // Declared before ':categoryId' so "jobs" is never read as a category id.
  @Get('jobs')
  @ApiOperation({ summary: 'Past and running imports, newest first' })
  async list(@Query() query: ListImportJobsQueryDto) {
    return this.jobs.list(query);
  }

  @Get('jobs/:jobId')
  @ApiOperation({ summary: 'One import with its progress and counts' })
  async get(@Param('jobId', ParseUUIDPipe) jobId: string) {
    return this.jobs.get(jobId);
  }

  @Get('jobs/:jobId/errors')
  @ApiOperation({ summary: 'A short-lived link to the rejected-rows workbook (404 if none)' })
  async errors(@Param('jobId', ParseUUIDPipe) jobId: string) {
    return this.jobs.getErrorDownloadUrl(jobId);
  }

  @Post('jobs/:jobId/undo')
  @ApiOperation({
    summary: 'Undo an import',
    description:
      'Deletes the products it created that are still drafts with no listing; keeps and counts the rest.',
  })
  async undo(
    @Param('jobId', ParseUUIDPipe) jobId: string,
    @CurrentUser('sub') adminUserId: string,
  ) {
    return this.jobs.undo(jobId, adminUserId);
  }

  @Post(':categoryId')
  @HttpCode(202)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_IMPORT_BYTES } }))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: 'Upload a completed import template (runs in the background)',
    description:
      'Answers 202 with a jobId straight away; poll GET jobs/:jobId for progress. Valid rows become ' +
      'draft products; rejected rows go to a downloadable workbook. .xlsx only, up to 20 MB.',
  })
  async upload(
    @Param('categoryId', ParseUUIDPipe) categoryId: string,
    @UploadedFile() file: Express.Multer.File | undefined,
    @CurrentUser('sub') adminUserId: string,
  ) {
    if (!file) {
      throw new BadRequestException('file is required (multipart field name: "file")');
    }
    if (!file.originalname.toLowerCase().endsWith('.xlsx') || !XLSX_MIME_TYPES.has(file.mimetype)) {
      throw new BadRequestException('Upload the filled-in template as an .xlsx file');
    }
    return this.jobs.enqueue(adminUserId, categoryId, file.buffer);
  }
}
