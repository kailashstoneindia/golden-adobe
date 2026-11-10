import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';
import { DELIVERY_ASSIGNMENT_STATUSES } from '@golden-abode/types';
import type { DeliveryAssignmentStatus } from '@golden-abode/types';

class PageQueryDto {
  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number = 20;
}

export class QueueQueryDto extends PageQueryDto {
  @ApiPropertyOptional({ description: 'Only groups whose vendor is in this city' })
  @IsOptional()
  @IsUUID()
  cityId?: string;
}

export class AssignmentListQueryDto extends PageQueryDto {
  @ApiPropertyOptional({ enum: Object.values(DELIVERY_ASSIGNMENT_STATUSES) })
  @IsOptional()
  @IsIn(Object.values(DELIVERY_ASSIGNMENT_STATUSES))
  status?: DeliveryAssignmentStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  driverId?: string;
}

export class AssignDeliveryDto {
  @ApiProperty()
  @IsUUID()
  orderVendorGroupId: string;

  @ApiProperty()
  @IsUUID()
  driverId: string;
}

export class DriverIdDto {
  @ApiProperty()
  @IsUUID()
  driverId: string;
}
