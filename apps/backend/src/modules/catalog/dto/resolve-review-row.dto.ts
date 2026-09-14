import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class ResolveReviewRowLinkDto {
  @ApiProperty({ description: 'master_product to link this row to' })
  @IsString()
  masterProductId!: string;
}

export class ResolveReviewRowRejectDto {
  @ApiProperty()
  @IsString()
  reason!: string;
}
