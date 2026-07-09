import { ApiProperty } from '@nestjs/swagger';
import {
  IsIn,
  IsNotEmpty,
  IsString,
} from 'class-validator';
import {
  VENDOR_ONBOARDING_STAGES,
  VendorOnboardingStage,
} from '@golden-abode/types';

export class UpdateVendorOnboardingProgressDto {
  @ApiProperty({
    enum: Object.values(VENDOR_ONBOARDING_STAGES),
    example: VENDOR_ONBOARDING_STAGES.shopDetails,
  })
  @IsString()
  @IsNotEmpty()
  @IsIn(Object.values(VENDOR_ONBOARDING_STAGES))
  onboardingStage: VendorOnboardingStage;
}
