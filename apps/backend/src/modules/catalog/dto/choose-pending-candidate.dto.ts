import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class ChoosePendingCandidateDto {
  @ApiProperty({ description: 'master_product id chosen from the alternatives shown' })
  @IsString()
  masterProductId!: string;
}
