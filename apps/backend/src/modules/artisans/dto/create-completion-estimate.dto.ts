import { IsInt, IsOptional, IsString, IsNotEmpty, Min } from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CreateCompletionEstimateDto as CreateCompletionEstimateContract } from '@golden-abode/types';

// Always appended (spec §8.2/§8.4), never an update — the service layer
// only ever .create()s a new row, this DTO just carries the one it will
// create.
export class CreateCompletionEstimateDto implements CreateCompletionEstimateContract {
  @ApiProperty({ example: 5, description: 'Duration in days, not a target date' })
  @IsInt()
  @Min(1)
  estimatedDays: number;

  @ApiPropertyOptional({ example: 'Found water damage' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  note?: string;
}
