import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class RejectUserDto {
  @ApiPropertyOptional({ description: 'Optional note stored in logs only' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
