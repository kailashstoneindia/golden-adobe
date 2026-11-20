import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

// Decision 0063: the product in the URL is folded into this one.
export class MergeProductDto {
  @ApiProperty({ description: 'The product that stays.' })
  @IsUUID()
  intoProductId!: string;
}
