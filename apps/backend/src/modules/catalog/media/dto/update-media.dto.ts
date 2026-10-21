import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';

export class UpdateMediaDto {
  @ApiPropertyOptional({
    description: 'true makes this the primary image. false is refused: promote another instead.',
  })
  @IsOptional()
  @IsBoolean()
  isPrimary?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isRepresentative?: boolean;
}
