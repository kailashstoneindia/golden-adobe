import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { OrderVendorGroupStatus } from '../models/order-vendor-group.model';

export class AdminOverrideGroupStatusDto {
  @ApiProperty({ enum: OrderVendorGroupStatus })
  @IsEnum(OrderVendorGroupStatus)
  status: OrderVendorGroupStatus;

  @ApiProperty({ description: 'Required — why this override was necessary. Logged.' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason: string;
}
