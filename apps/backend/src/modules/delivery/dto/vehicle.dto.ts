import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateVehicleDto {
  @ApiProperty({ example: 'DL1CAB1234', maxLength: 32 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(32)
  registrationNumber: string;

  @ApiProperty({ example: 'Tempo', maxLength: 64 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  type: string;

  @ApiPropertyOptional({ maxLength: 255 })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  notes?: string;
}

export class UpdateVehicleDto {
  @ApiPropertyOptional({ maxLength: 64 })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  type?: string;

  @ApiPropertyOptional({ maxLength: 255 })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  notes?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
