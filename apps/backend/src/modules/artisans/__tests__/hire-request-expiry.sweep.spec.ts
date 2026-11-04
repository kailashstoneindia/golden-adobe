import { HireRequestExpirySweep } from '../hire-request-expiry.sweep';

describe('HireRequestExpirySweep (0055)', () => {
  const build = (workerMode: string) => {
    const service = { expireStaleResponses: jest.fn().mockResolvedValue(2) };
    const config = { get: jest.fn().mockReturnValue(workerMode) };
    return { sweep: new HireRequestExpirySweep(service as never, config as never), service };
  };

  it('expires stale responses when this process owns scheduled work', async () => {
    const { sweep, service } = build('all');
    await sweep.run();
    expect(service.expireStaleResponses).toHaveBeenCalledTimes(1);
  });

  it('does nothing on an API-only worker', async () => {
    const { sweep, service } = build('api');
    await sweep.run();
    expect(service.expireStaleResponses).not.toHaveBeenCalled();
  });

  it('logs and swallows a failure so the scheduler keeps running', async () => {
    const { sweep, service } = build('all');
    service.expireStaleResponses.mockRejectedValueOnce(new Error('db down'));
    await expect(sweep.run()).resolves.toBeUndefined();
  });
});
