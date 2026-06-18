import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty } from 'class-validator';

export class RefreshTokenDto {
  @ApiProperty({
    example: 'dGhpcyBpcyBhIHJlZnJlc2ggdG9rZW4...',
    description: 'Refresh token received during login or last refresh',
  })
  @IsString()
  @IsNotEmpty()
  refreshToken: string;
}
