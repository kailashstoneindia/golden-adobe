import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class RejectVendorDto {
  @ApiProperty({ description: 'Why this vendor is being rejected — shown to admin later' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason: string;
}
