import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { RazorpayProviderService } from '../razorpay-provider.service';

describe('RazorpayProviderService.verifyWebhookSignature', () => {
  const webhookSecret = 'test-webhook-secret';
  let service: RazorpayProviderService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        RazorpayProviderService,
        {
          provide: ConfigService,
          useValue: {
            get: (key: string) => (key === 'RAZORPAY_WEBHOOK_SECRET' ? webhookSecret : ''),
          },
        },
      ],
    }).compile();
    service = moduleRef.get(RazorpayProviderService);
  });

  it('accepts a correctly signed payload', () => {
    const body = JSON.stringify({ event: 'payment.captured' });
    const signature = crypto.createHmac('sha256', webhookSecret).update(body).digest('hex');
    expect(service.verifyWebhookSignature(body, signature)).toBe(true);
  });

  it('rejects a payload with a tampered signature', () => {
    const body = JSON.stringify({ event: 'payment.captured' });
    const wrongSignature = crypto.createHmac('sha256', 'wrong-secret').update(body).digest('hex');
    expect(service.verifyWebhookSignature(body, wrongSignature)).toBe(false);
  });

  it('rejects when the signature header is missing', () => {
    const body = JSON.stringify({ event: 'payment.captured' });
    expect(service.verifyWebhookSignature(body, '')).toBe(false);
  });

  it('rejects when the body has been tampered with after signing', () => {
    const originalBody = JSON.stringify({ event: 'payment.captured', amount: 100 });
    const signature = crypto.createHmac('sha256', webhookSecret).update(originalBody).digest('hex');
    const tamperedBody = JSON.stringify({ event: 'payment.captured', amount: 999999 });
    expect(service.verifyWebhookSignature(tamperedBody, signature)).toBe(false);
  });
});
