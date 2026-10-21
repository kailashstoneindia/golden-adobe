import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Role } from '@golden-abode/types';

import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CitiesService } from './cities.service';

@ApiTags('Admin Cities')
@Controller('admin/cities')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
@ApiBearerAuth()
export class AdminCitiesController {
  constructor(private readonly citiesService: CitiesService) {}

  @Get()
  @ApiOperation({
    summary: 'List active launch cities',
    description:
      'Admin-curated cities used when pinning a vendor to a city (decision 0018). Inactive cities are omitted so they cannot be selected.',
  })
  @ApiResponse({ status: 200, description: 'Active cities, ordered by state then name' })
  async list() {
    return this.citiesService.listActiveCities();
  }
}
