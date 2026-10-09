import { Test } from '@nestjs/testing';
import { LogNotificationService } from '../log-notification.service';

describe('LogNotificationService', () => {
  let service: LogNotificationService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [LogNotificationService],
    }).compile();
    service = moduleRef.get(LogNotificationService);
  });

  it('sendOrderPlaced resolves without throwing', async () => {
    await expect(service.sendOrderPlaced('customer-1', 'order-1')).resolves.toBeUndefined();
  });

  it('sendOrderStatusChanged resolves without throwing', async () => {
    await expect(
      service.sendOrderStatusChanged('customer-1', 'order-1', 'confirmed'),
    ).resolves.toBeUndefined();
  });

  it('sendNewOrderToVendor resolves without throwing', async () => {
    await expect(
      service.sendNewOrderToVendor('vendor-1', 'order-vendor-group-1'),
    ).resolves.toBeUndefined();
  });
});
