import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class UpdateDeviceTokenDto {
  @ApiProperty({ description: 'Expo/FCM push token for this device' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  deviceToken: string;
}
