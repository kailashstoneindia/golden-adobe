import { Test } from '@nestjs/testing';
import { getModelToken } from '@nestjs/sequelize';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Sequelize } from 'sequelize-typescript';
import { CheckoutService } from '../checkout.service';
import { Order } from '../models/order.model';
import { OrderVendorGroup } from '../models/order-vendor-group.model';
import { OrderItem } from '../models/order-item.model';
import { CustomerAddress } from '../../customers/models/customer-address.model';
import { CartService } from '../../cart/cart.service';
import { CustomersService } from '../../customers/customers.service';
import { PAYMENT_PROVIDER } from '../../payments/payment-provider.interface';
import { ArtisanHireRequest } from '../../artisans/models/artisan-hire-request.model';

// Unit-level coverage for validateBooking only (decision 0045) — the rest
// of CheckoutService.checkout() has no existing test fixture to extend
// (no cart/order integration harness exists in this codebase today), so
// this spec is scoped to the one new, independently testable method
// rather than attempting to exercise the whole checkout transaction.
describe('CheckoutService.validateBooking', () => {
  let service: CheckoutService;
  let hireRequestModelMock: { findByPk: jest.Mock };

  beforeEach(async () => {
    hireRequestModelMock = { findByPk: jest.fn() };

    const moduleRef = await Test.createTestingModule({
      providers: [
        CheckoutService,
        { provide: getModelToken(Order), useValue: {} },
        { provide: getModelToken(OrderVendorGroup), useValue: {} },
        { provide: getModelToken(OrderItem), useValue: {} },
        { provide: getModelToken(CustomerAddress), useValue: {} },
        { provide: getModelToken(ArtisanHireRequest), useValue: hireRequestModelMock },
        { provide: Sequelize, useValue: {} },
        { provide: CartService, useValue: {} },
        { provide: CustomersService, useValue: {} },
        { provide: PAYMENT_PROVIDER, useValue: {} },
      ],
    }).compile();

    service = moduleRef.get(CheckoutService);
  });

  it('accepts a booking that belongs to the caller and is ACCEPTED_BY_ARTISAN', async () => {
    hireRequestModelMock.findByPk.mockResolvedValue({
      id: 'booking-1',
      customerId: 'user-1',
      status: 'ACCEPTED_BY_ARTISAN',
    });

    await expect(service.validateBooking('user-1', 'booking-1')).resolves.toMatchObject({
      id: 'booking-1',
    });
  });

  it('accepts a booking that is IN_PROGRESS', async () => {
    hireRequestModelMock.findByPk.mockResolvedValue({
      id: 'booking-1',
      customerId: 'user-1',
      status: 'IN_PROGRESS',
    });

    await expect(service.validateBooking('user-1', 'booking-1')).resolves.toMatchObject({
      id: 'booking-1',
    });
  });

  it('accepts a booking that is COMPLETED', async () => {
    hireRequestModelMock.findByPk.mockResolvedValue({
      id: 'booking-1',
      customerId: 'user-1',
      status: 'COMPLETED',
    });

    await expect(service.validateBooking('user-1', 'booking-1')).resolves.toMatchObject({
      id: 'booking-1',
    });
  });

  it('rejects a booking that does not exist', async () => {
    hireRequestModelMock.findByPk.mockResolvedValue(null);

    await expect(service.validateBooking('user-1', 'missing')).rejects.toThrow(NotFoundException);
  });

  it('rejects a booking owned by a different customer', async () => {
    hireRequestModelMock.findByPk.mockResolvedValue({
      id: 'booking-1',
      customerId: 'someone-else',
      status: 'ACCEPTED_BY_ARTISAN',
    });

    await expect(service.validateBooking('user-1', 'booking-1')).rejects.toThrow(
      ForbiddenException,
    );
  });

  it.each(['PENDING_ADMIN_REVIEW', 'ADMIN_REJECTED', 'CANCELLED'])(
    'rejects a booking in status %s',
    async (status) => {
      hireRequestModelMock.findByPk.mockResolvedValue({
        id: 'booking-1',
        customerId: 'user-1',
        status,
      });

      await expect(service.validateBooking('user-1', 'booking-1')).rejects.toThrow(
        ForbiddenException,
      );
    },
  );
});

describe('CheckoutService.reconfirmBookingStatus', () => {
  let service: CheckoutService;
  let hireRequestModelMock: { findByPk: jest.Mock };
  const mockTransaction = {};

  beforeEach(async () => {
    hireRequestModelMock = { findByPk: jest.fn() };

    const moduleRef = await Test.createTestingModule({
      providers: [
        CheckoutService,
        { provide: getModelToken(Order), useValue: {} },
        { provide: getModelToken(OrderVendorGroup), useValue: {} },
        { provide: getModelToken(OrderItem), useValue: {} },
        { provide: getModelToken(CustomerAddress), useValue: {} },
        { provide: getModelToken(ArtisanHireRequest), useValue: hireRequestModelMock },
        { provide: Sequelize, useValue: {} },
        { provide: CartService, useValue: {} },
        { provide: CustomersService, useValue: {} },
        { provide: PAYMENT_PROVIDER, useValue: {} },
      ],
    }).compile();

    service = moduleRef.get(CheckoutService);
  });

  it('passes when the booking is still attributable at commit time', async () => {
    hireRequestModelMock.findByPk.mockResolvedValue({ id: 'booking-1', status: 'IN_PROGRESS' });

    await expect(
      service.reconfirmBookingStatus('booking-1', mockTransaction as never),
    ).resolves.toBeUndefined();
  });

  it('rejects when the booking was cancelled between validation and commit', async () => {
    hireRequestModelMock.findByPk.mockResolvedValue({ id: 'booking-1', status: 'CANCELLED' });

    await expect(
      service.reconfirmBookingStatus('booking-1', mockTransaction as never),
    ).rejects.toThrow(ForbiddenException);
  });

  it('rejects when the booking no longer exists at commit time', async () => {
    hireRequestModelMock.findByPk.mockResolvedValue(null);

    await expect(
      service.reconfirmBookingStatus('booking-1', mockTransaction as never),
    ).rejects.toThrow(NotFoundException);
  });
});
