import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty } from 'class-validator';

export class LogoutDto {
  @ApiProperty({
    example: 'dGhpcyBpcyBhIHJlZnJlc2ggdG9rZW4...',
    description: 'Refresh token to revoke on logout',
  })
  @IsString()
  @IsNotEmpty()
  refreshToken: string;
}
