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

  it('sendHireRequestStatusChanged resolves without throwing', async () => {
    await expect(
      service.sendHireRequestStatusChanged('user-1', 'hire-request-1', 'IN_PROGRESS'),
    ).resolves.toBeUndefined();
  });
});

describe('LogNotificationService delivery notifications (decision 0060)', () => {
  let service: LogNotificationService;
  let logSpy: jest.SpyInstance;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [LogNotificationService],
    }).compile();
    service = moduleRef.get(LogNotificationService);
    logSpy = jest
      .spyOn((service as unknown as { logger: { log: () => void } }).logger, 'log')
      .mockImplementation();
  });

  it('sendDeliveryAssigned logs one line', async () => {
    await expect(service.sendDeliveryAssigned('user-1', 'asg-1')).resolves.toBeUndefined();
    expect(logSpy).toHaveBeenCalledTimes(1);
    expect(logSpy.mock.calls[0][0]).toContain('asg-1');
  });

  it('sendDeliveryOtp logs one line', async () => {
    await expect(service.sendDeliveryOtp('cust-1', 'order-1', '123456')).resolves.toBeUndefined();
    expect(logSpy).toHaveBeenCalledTimes(1);
    expect(logSpy.mock.calls[0][0]).toContain('order-1');
  });
});
