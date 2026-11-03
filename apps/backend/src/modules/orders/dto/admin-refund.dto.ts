import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, IsUUID, MaxLength, Min, MinLength } from 'class-validator';

export class AdminRefundDto {
  @ApiProperty({ description: 'Why this refund is being issued. Stored with the refund.' })
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason!: string;

  @ApiPropertyOptional({ description: 'Paise to refund. Omit to refund whatever is left.' })
  @IsOptional()
  @IsInt()
  @Min(100)
  amountPaise?: number;

  @ApiPropertyOptional({ description: 'Vendor group this partial refund is for.' })
  @IsOptional()
  @IsUUID()
  vendorGroupId?: string;
}
