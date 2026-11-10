import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Role } from '@golden-abode/types';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { DriversService } from './drivers.service';
import {
  ConfirmDriverDocumentDto,
  CreateDriverDto,
  DriverDocumentUploadUrlDto,
  ListDriversQueryDto,
  UpdateDriverDto,
} from './dto/driver.dto';

@ApiTags('Admin delivery')
@Controller('admin/drivers')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
@ApiBearerAuth()
export class AdminDriversController {
  constructor(private readonly driversService: DriversService) {}

  @Post()
  @ApiOperation({
    summary: 'Create a driver account',
    description:
      'Creates the DRIVER user and driver profile. The driver then logs in with phone OTP.',
  })
  @ApiResponse({ status: 409, description: 'Phone or vehicle already in use' })
  create(@Body() dto: CreateDriverDto) {
    return this.driversService.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'Paginated driver list' })
  list(@Query() query: ListDriversQueryDto) {
    return this.driversService.list(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'One driver with vehicle and document links' })
  @ApiResponse({ status: 404, description: 'Driver not found' })
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.driversService.get(id);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Edit a driver',
    description:
      'Name, phone, licence number, helper and vehicle. Use PATCH /admin/users/:id/active to deactivate.',
  })
  @ApiResponse({ status: 404, description: 'Driver not found' })
  @ApiResponse({ status: 409, description: 'Phone or vehicle already in use' })
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateDriverDto) {
    return this.driversService.update(id, dto);
  }

  @Post(':id/document-upload-url')
  @ApiOperation({ summary: 'Presigned upload for a licence or Aadhaar document image' })
  createDocumentUploadUrl(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: DriverDocumentUploadUrlDto,
  ) {
    return this.driversService.createDocumentUploadUrl(id, dto.kind, dto.contentType);
  }

  @Post(':id/documents/confirm')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Confirm an uploaded document and attach it to the driver' })
  confirmDocument(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ConfirmDriverDocumentDto) {
    return this.driversService.confirmDocument(id, dto.kind, dto.key);
  }
}
