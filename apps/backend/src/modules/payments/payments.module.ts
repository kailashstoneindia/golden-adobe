import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PAYMENT_PROVIDER } from './payment-provider.interface';
import { RazorpayProviderService } from './razorpay-provider.service';

@Module({
  imports: [ConfigModule],
  providers: [
    RazorpayProviderService,
    { provide: PAYMENT_PROVIDER, useExisting: RazorpayProviderService },
  ],
  exports: [PAYMENT_PROVIDER],
})
export class PaymentsModule {}
