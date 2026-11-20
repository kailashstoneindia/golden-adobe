import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { DELIVERY_FAILURE_REASONS } from '@golden-abode/types';
import type { DeliveryFailureReason } from '@golden-abode/types';

export class DriverJobsQueryDto {
  @ApiPropertyOptional({ enum: ['active', 'history'], default: 'active' })
  @IsOptional()
  @IsIn(['active', 'history'])
  scope?: 'active' | 'history' = 'active';
}

export class PickupItemDto {
  @ApiProperty()
  @IsUUID()
  orderItemId: string;

  @ApiProperty({ description: 'Must be true for every item before the driver can leave' })
  @IsBoolean()
  loaded: boolean;
}

export class PickupDto {
  @ApiProperty({ type: [PickupItemDto] })
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => PickupItemDto)
  items: PickupItemDto[];
}

export class DeliveryPhotoUrlDto {
  @ApiProperty({ enum: ['delivered', 'failed'] })
  @IsIn(['delivered', 'failed'])
  kind: 'delivered' | 'failed';

  @ApiProperty({ enum: ['image/jpeg', 'image/png'] })
  @IsIn(['image/jpeg', 'image/png'])
  contentType: string;
}

export class CompleteDeliveryDto {
  @ApiProperty({ example: '123456', description: 'The code the customer shows in their app' })
  @Matches(/^\d{6}$/, { message: 'otp must be 6 digits' })
  otp: string;

  @ApiProperty({ description: 'Key returned by the photo-url upload' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  photoKey: string;
}

export class FailDeliveryDto {
  @ApiProperty({ enum: DELIVERY_FAILURE_REASONS })
  @IsIn(DELIVERY_FAILURE_REASONS)
  reason: DeliveryFailureReason;

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;

  @ApiProperty({ description: 'Key returned by the photo-url upload' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  photoKey: string;
}
