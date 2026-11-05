import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

export class SetUserActiveDto {
  @ApiProperty({ description: 'false deactivates the account and signs the user out everywhere' })
  @IsBoolean()
  isActive: boolean;
}
