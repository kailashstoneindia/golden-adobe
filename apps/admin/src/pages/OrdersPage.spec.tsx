import { Role, type AdminOrderDto, type AdminRefundRowDto } from '@golden-abode/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';

import { ERROR_MESSAGES } from '@/constants/error.constants';
import { MemoryRouter } from 'react-router-dom';
import { server } from '@/test/server';

import { OrdersPage } from './OrdersPage';

const BASE = '/api/admin/orders';

function order(over: Partial<AdminOrderDto> = {}): AdminOrderDto {
  return {
    id: 'o1111111-1111-4111-8111-111111111111',
    customerId: 'c1111111-1111-4111-8111-111111111111',
    deliveryAddressId: 'd1111111-1111-4111-8111-111111111111',
    grandTotal: 500,
    capturedPaise: null,
    status: 'confirmed',
    razorpayOrderId: 'order_rzp1',
    razorpayPaymentId: 'pay_rzp1',
    bookingId: null,
    createdAt: '2026-11-01T10:00:00.000Z',
    updatedAt: '2026-11-01T10:00:00.000Z',
    deliveryAddress: null,
    vendorGroups: [],
    customer: {
      userId: 'u-cust',
      name: 'Asha Rao',
      phone: '9876543210',
      email: 'asha@example.com',
      role: Role.CUSTOMER,
      isActive: true,
      isApproved: true,
      lastLoginAt: null,
    },
    customerFullName: 'Asha Rao Kumar',
    itemCount: 0,
    hireRequestId: null,
    ...over,
  };
}

function refund(over: Partial<AdminRefundRowDto> = {}): AdminRefundRowDto {
  return {
    id: 'r1',
    orderId: 'o1111111-1111-4111-8111-111111111111',
    orderVendorGroupId: null,
    rail: 'razorpay',
    amountPaise: 20000,
    receipt: 'rf_o1_1',
    razorpayRefundId: null,
    status: 'submitted',
    reason: 'Vendor cancelled',
    createdBy: 'admin1',
    createdByName: 'Admin Priya',
    payoutReference: null,
    razorpayPaymentId: null,
    updatedAt: '2026-11-02T10:00:00.000Z',
    createdAt: '2026-11-02T10:00:00.000Z',
    ...over,
  };
}

let orders: AdminOrderDto[];
let refunds: Record<string, AdminRefundRowDto[]>;
let refundBodies: unknown[];
let refundListFetches: number;
// Holds GET /refunds open until released, or answers it with an error.
let refundsGate: Promise<void> | null;
let refundsListFails: boolean;
// Holds POST /refund open until released.
let refundPostGate: Promise<void> | null;
let ordersListFetches: number;
// What the next POST /refund answers, and what it does to the server's refunds.
let refundReply: {
  status: number;
  message?: string;
  recordRefund?: AdminRefundRowDto;
  orderStatus?: string;
  networkError?: boolean;
};

function useHandlers() {
  server.use(
    http.get(BASE, () => {
      ordersListFetches += 1;
      return HttpResponse.json({ success: true, data: orders });
    }),
    http.get(`${BASE}/:id/refunds`, async ({ params }) => {
      refundListFetches += 1;
      if (refundsGate) {
        await refundsGate;
      }
      if (refundsListFails) {
        return HttpResponse.json({ success: false, message: 'boom' }, { status: 500 });
      }
      return HttpResponse.json({ success: true, data: refunds[String(params.id)] ?? [] });
    }),
    http.post(`${BASE}/:id/refund`, async ({ params, request }) => {
      refundBodies.push(await request.json());
      if (refundPostGate) {
        await refundPostGate;
      }
      const id = String(params.id);
      if (refundReply.recordRefund) {
        refunds[id] = [...(refunds[id] ?? []), refundReply.recordRefund];
      }
      // What the server did to the order before it answered; the list
      // refetch then reports it.
      if (refundReply.orderStatus) {
        orders = orders.map((o) =>
          o.id === id
            ? {
                ...o,
                status: refundReply.orderStatus as AdminOrderDto['status'],
                updatedAt: 'later',
              }
            : o,
        );
      }
      if (refundReply.networkError) {
        return HttpResponse.error();
      }
      if (refundReply.status >= 400) {
        return HttpResponse.json(
          { success: false, message: refundReply.message },
          { status: refundReply.status },
        );
      }
      const found = orders.find((o) => o.id === id);
      return HttpResponse.json(
        { success: true, data: { ...found, status: refundReply.orderStatus ?? 'refund_pending' } },
        { status: refundReply.status },
      );
    }),
  );
}

function renderPage(path = '/') {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <OrdersPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('OrdersPage refunds', () => {
  beforeEach(() => {
    orders = [
      order({ id: 'o1', status: 'confirmed', grandTotal: 500 }),
      order({
        id: 'o2',
        status: 'refund_required',
        grandTotal: 300,
        createdAt: '2026-11-01T09:00:00.000Z',
      }),
      order({ id: 'o3', status: 'pending_payment', grandTotal: 100 }),
    ];
    refunds = {};
    refundBodies = [];
    refundListFetches = 0;
    refundsGate = null;
    refundsListFails = false;
    refundPostGate = null;
    ordersListFetches = 0;
    refundReply = { status: 200 };
    useHandlers();
  });

  it('shows only refund_required orders under the Needs refund filter', async () => {
    renderPage();
    const user = userEvent.setup();
    expect(await screen.findByText('o3')).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText('Status filter'), 'Needs refund');

    const rows = screen.getAllByRole('row').slice(1);
    expect(rows).toHaveLength(1);
    expect(within(rows[0]).getByText('o2')).toBeInTheDocument();
  });

  it('sorts Needs refund oldest first', async () => {
    orders = [
      order({ id: 'newer', status: 'refund_required', createdAt: '2026-11-02T00:00:00.000Z' }),
      order({ id: 'older', status: 'refund_required', createdAt: '2026-11-01T00:00:00.000Z' }),
    ];
    renderPage();
    const user = userEvent.setup();
    await screen.findByText('newer');

    await user.selectOptions(screen.getByLabelText('Status filter'), 'Needs refund');

    const rows = screen.getAllByRole('row').slice(1);
    expect(within(rows[0]).getByText('older')).toBeInTheDocument();
    expect(within(rows[1]).getByText('newer')).toBeInTheDocument();
  });

  it('offers Refund for confirmed and refund_required orders only', async () => {
    renderPage();
    const user = userEvent.setup();

    await user.click(await screen.findByText('o3'));
    expect(screen.queryByRole('button', { name: 'Refund' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Close' }));

    await user.click(screen.getByText('o1'));
    expect(screen.getByRole('button', { name: 'Refund' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Close' }));

    await user.click(screen.getByText('o2'));
    expect(screen.getByRole('button', { name: 'Refund' })).toBeInTheDocument();
  });

  it('locks the amount to the full total for a refund_required order', async () => {
    renderPage();
    const user = userEvent.setup();

    await user.click(await screen.findByText('o2'));

    const amount = screen.getByLabelText('Refund amount (₹)');
    await waitFor(() => expect(amount).toHaveValue(300));
    expect(amount).toBeDisabled();
  });

  it('locks a refund_required order to the captured amount when it differs from the total', async () => {
    orders = [
      order({ id: 'o2', status: 'refund_required', grandTotal: 300, capturedPaise: 25050 }),
    ];
    renderPage();
    const user = userEvent.setup();

    await user.click(await screen.findByText('o2'));

    const amount = screen.getByLabelText('Refund amount (₹)');
    expect(amount).toBeDisabled();
    expect(amount).toHaveValue(250.5);
  });

  it('defaults the amount to what is left after earlier non-failed refunds', async () => {
    refunds = {
      o1: [
        refund({ id: 'a', orderId: 'o1', amountPaise: 20000, status: 'processed' }),
        refund({ id: 'b', orderId: 'o1', amountPaise: 5000, status: 'failed' }),
      ],
    };
    renderPage();
    const user = userEvent.setup();

    await user.click(await screen.findByText('o1'));

    await waitFor(() => expect(screen.getByLabelText('Refund amount (₹)')).toHaveValue(300));
    expect(screen.getByLabelText('Refund amount (₹)')).toBeEnabled();
  });

  it('keeps Submit disabled until a reason is entered', async () => {
    renderPage();
    const user = userEvent.setup();
    await user.click(await screen.findByText('o1'));
    await waitFor(() => expect(screen.getByLabelText('Refund reason')).toBeEnabled());

    const submit = screen.getByRole('button', { name: 'Refund' });
    expect(submit).toBeDisabled();

    await user.type(screen.getByLabelText('Refund reason'), 'Vendor cancelled');
    expect(submit).toBeEnabled();
  });

  it('sends amount in paise and the reason', async () => {
    renderPage();
    const user = userEvent.setup();
    await user.click(await screen.findByText('o1'));
    await waitFor(() => expect(screen.getByLabelText('Refund reason')).toBeEnabled());

    const amount = screen.getByLabelText('Refund amount (₹)');
    await user.clear(amount);
    await user.type(amount, '250.50');
    await user.type(screen.getByLabelText('Refund reason'), 'Vendor cancelled');
    await user.click(screen.getByRole('button', { name: 'Refund' }));

    await waitFor(() => expect(refundBodies).toHaveLength(1));
    expect(refundBodies[0]).toEqual({ amountPaise: 25050, reason: 'Vendor cancelled' });
  });

  it('sends only the reason for a refund_required order so the server refunds it in full', async () => {
    renderPage();
    const user = userEvent.setup();
    await user.click(await screen.findByText('o2'));
    await waitFor(() => expect(screen.getByLabelText('Refund reason')).toBeEnabled());

    await user.type(screen.getByLabelText('Refund reason'), 'Late payment');
    await user.click(screen.getByRole('button', { name: 'Refund' }));

    await waitFor(() => expect(refundBodies).toHaveLength(1));
    expect(refundBodies[0]).toEqual({ reason: 'Late payment' });
  });

  it('sends one request when Refund is clicked twice before the first settles', async () => {
    renderPage();
    const user = userEvent.setup();
    await user.click(await screen.findByText('o2'));
    await waitFor(() => expect(screen.getByLabelText('Refund reason')).toBeEnabled());
    await user.type(screen.getByLabelText('Refund reason'), 'Late payment');
    const submit = screen.getByRole('button', { name: 'Refund' });

    // Both clicks land before React re-renders the button as disabled.
    act(() => {
      submit.click();
      submit.click();
    });

    await waitFor(() => expect(refundBodies).toHaveLength(1));
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(refundBodies).toHaveLength(1);
  });

  it('lists existing refunds with amount and status, newest first', async () => {
    refunds = {
      o1: [
        refund({
          id: 'old',
          amountPaise: 10000,
          status: 'processed',
          createdAt: '2026-11-01T10:00:00.000Z',
        }),
        refund({
          id: 'new',
          amountPaise: 20000,
          status: 'submitted',
          createdAt: '2026-11-02T10:00:00.000Z',
        }),
      ],
    };
    renderPage();
    const user = userEvent.setup();

    await user.click(await screen.findByText('o1'));

    const items = await screen.findAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent('₹200.00 · Submitted');
    expect(items[1]).toHaveTextContent('₹100.00 · Processed');
  });

  // Decision 0054 rule 5: the remaining amount comes from the refund history,
  // so the form must not be usable on an empty default.
  it('disables the whole refund form until the refund history has loaded', async () => {
    let release!: () => void;
    refundsGate = new Promise<void>((resolve) => {
      release = resolve;
    });
    refunds = {
      o1: [refund({ id: 'a', orderId: 'o1', amountPaise: 20000, status: 'processed' })],
    };
    renderPage();
    const user = userEvent.setup();

    await user.click(await screen.findByText('o1'));

    expect(screen.getByLabelText('Refund amount (₹)')).toBeDisabled();
    expect(screen.getByLabelText('Refund reason')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Refund' })).toBeDisabled();

    release();

    await waitFor(() => expect(screen.getByLabelText('Refund amount (₹)')).toBeEnabled());
    expect(screen.getByLabelText('Refund amount (₹)')).toHaveValue(300);
    expect(screen.getByLabelText('Refund reason')).toBeEnabled();
  });

  it('keeps the refund form disabled and says why when the refund history fails to load', async () => {
    refundsListFails = true;
    renderPage();
    const user = userEvent.setup();

    await user.click(await screen.findByText('o1'));

    expect(await screen.findByText(ERROR_MESSAGES.refundHistoryLoadFailed)).toBeInTheDocument();
    expect(screen.getByLabelText('Refund amount (₹)')).toBeDisabled();
    expect(screen.getByLabelText('Refund reason')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Refund' })).toBeDisabled();
  });

  describe('refund outcome', () => {
    // The admin may close the modal (or open another order) while a refund is
    // in flight; the late response must not bring the first order back.
    it('keeps the modal closed when the response arrives after the admin closed it', async () => {
      let release!: () => void;
      refundPostGate = new Promise<void>((resolve) => {
        release = resolve;
      });
      refundReply = { status: 200, orderStatus: 'refund_pending' };
      renderPage();
      const user = userEvent.setup();
      await user.click(await screen.findByText('o1'));
      await waitFor(() => expect(screen.getByLabelText('Refund reason')).toBeEnabled());
      await user.type(screen.getByLabelText('Refund reason'), 'Vendor cancelled');
      await user.click(screen.getByRole('button', { name: 'Refund' }));
      await waitFor(() => expect(refundBodies).toHaveLength(1));

      await user.click(screen.getByRole('button', { name: 'Close' }));
      const fetchesBefore = ordersListFetches;
      release();

      await waitFor(() => expect(ordersListFetches).toBeGreaterThan(fetchesBefore));
      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('does not switch to another order the admin opened while the refund was in flight', async () => {
      let release!: () => void;
      refundPostGate = new Promise<void>((resolve) => {
        release = resolve;
      });
      refundReply = { status: 200, orderStatus: 'refund_pending' };
      renderPage();
      const user = userEvent.setup();
      await user.click(await screen.findByText('o1'));
      await waitFor(() => expect(screen.getByLabelText('Refund reason')).toBeEnabled());
      await user.type(screen.getByLabelText('Refund reason'), 'Vendor cancelled');
      await user.click(screen.getByRole('button', { name: 'Refund' }));
      await waitFor(() => expect(refundBodies).toHaveLength(1));

      await user.click(screen.getByRole('button', { name: 'Close' }));
      await user.click(screen.getByText('o3'));
      const fetchesBefore = ordersListFetches;
      release();

      await waitFor(() => expect(ordersListFetches).toBeGreaterThan(fetchesBefore));
      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(screen.getByRole('dialog')).toHaveTextContent('Pending payment');
    });

    async function openConfirmedWithEarlierRefund() {
      orders = [order({ id: 'o1', status: 'confirmed', grandTotal: 1000 })];
      refunds = {
        o1: [refund({ id: 'a', orderId: 'o1', amountPaise: 20000, status: 'processed' })],
      };
      renderPage();
      const user = userEvent.setup();
      await user.click(await screen.findByText('o1'));
      await waitFor(() => expect(screen.getByLabelText('Refund amount (₹)')).toHaveValue(800));
      const amount = screen.getByLabelText('Refund amount (₹)');
      await user.clear(amount);
      await user.type(amount, '250.50');
      await user.type(screen.getByLabelText('Refund reason'), 'Partial return');
      return user;
    }

    it('on 202 says the refund is pending under the button, refetches the history and resets the form', async () => {
      refundReply = {
        status: 202,
        orderStatus: 'confirmed',
        recordRefund: refund({
          id: 'b',
          orderId: 'o1',
          amountPaise: 25050,
          status: 'requested',
          createdAt: '2026-11-03T10:00:00.000Z',
        }),
      };
      const user = await openConfirmedWithEarlierRefund();
      const fetchesBefore = refundListFetches;

      await user.click(screen.getByRole('button', { name: 'Refund' }));

      const notice = await screen.findByText(ERROR_MESSAGES.refundPending);
      expect(screen.getByRole('button', { name: 'Refund' }).nextElementSibling).toBe(notice);
      await waitFor(() => expect(refundListFetches).toBeGreaterThan(fetchesBefore));
      expect(await screen.findByText(/₹250.50 · Requested/)).toBeInTheDocument();
      await waitFor(() => expect(screen.getByLabelText('Refund amount (₹)')).toHaveValue(549.5));
      expect(screen.getByLabelText('Refund reason')).toHaveValue('');
    });

    it.each([
      ['a 504 from the gateway', { status: 504, message: 'Gateway Timeout' }],
      ['a dropped connection', { status: 0, networkError: true }],
    ])(
      'on %s says the refund may be recorded, refetches and clears the form so it cannot be sent twice',
      async (_label, reply) => {
        refundReply = {
          ...reply,
          recordRefund: refund({
            id: 'b',
            orderId: 'o1',
            amountPaise: 25050,
            status: 'requested',
            createdAt: '2026-11-03T10:00:00.000Z',
          }),
        };
        const user = await openConfirmedWithEarlierRefund();
        const fetchesBefore = refundListFetches;

        await user.click(screen.getByRole('button', { name: 'Refund' }));

        const notice = await screen.findByText(ERROR_MESSAGES.refundMaybeRecorded);
        expect(screen.getByRole('button', { name: 'Refund' }).nextElementSibling).toBe(notice);
        await waitFor(() => expect(refundListFetches).toBeGreaterThan(fetchesBefore));
        expect(await screen.findByText(/₹250.50 · Requested/)).toBeInTheDocument();
        await waitFor(() => expect(screen.getByLabelText('Refund amount (₹)')).toHaveValue(549.5));
        expect(screen.getByLabelText('Refund reason')).toHaveValue('');
        expect(screen.getByRole('button', { name: 'Refund' })).toBeDisabled();
      },
    );

    it('on 400 shows the status the server moved the order to, with the amount locked', async () => {
      refundReply = {
        status: 400,
        message: 'Razorpay reported this refund as failed.',
        orderStatus: 'refund_required',
      };
      const user = await openConfirmedWithEarlierRefund();
      const dialog = screen.getByRole('dialog');
      expect(dialog).toHaveTextContent('Confirmed');

      await user.click(screen.getByRole('button', { name: 'Refund' }));

      await screen.findByText('Razorpay reported this refund as failed.');
      await waitFor(() => expect(dialog).toHaveTextContent('Refund required'));
      expect(screen.getByLabelText('Refund amount (₹)')).toBeDisabled();
      expect(screen.getByLabelText('Refund amount (₹)')).toHaveValue(800);
    });

    it('on a lost response shows the status the server moved the order to', async () => {
      refundReply = { status: 504, message: 'Gateway Timeout', orderStatus: 'refund_pending' };
      const user = await openConfirmedWithEarlierRefund();

      await user.click(screen.getByRole('button', { name: 'Refund' }));

      await screen.findByText(ERROR_MESSAGES.refundMaybeRecorded);
      await waitFor(() =>
        expect(screen.getByRole('dialog')).toHaveTextContent('Refund in progress'),
      );
      expect(screen.queryByLabelText('Refund amount (₹)')).not.toBeInTheDocument();
    });

    it('on 400 shows the error under the button, refetches the history and keeps the form', async () => {
      refundReply = { status: 400, message: 'Razorpay createRefund failed with 404' };
      const user = await openConfirmedWithEarlierRefund();
      const fetchesBefore = refundListFetches;

      await user.click(screen.getByRole('button', { name: 'Refund' }));

      const notice = await screen.findByText('Razorpay createRefund failed with 404');
      expect(screen.getByRole('button', { name: 'Refund' }).nextElementSibling).toBe(notice);
      await waitFor(() => expect(refundListFetches).toBeGreaterThan(fetchesBefore));
      expect(screen.getByLabelText('Refund amount (₹)')).toHaveValue(250.5);
      expect(screen.getByLabelText('Refund reason')).toHaveValue('Partial return');
    });
  });
});

// Decision 0058 Task 4d: the admin sees who is involved and every payment fact.
describe('OrdersPage who and payment details', () => {
  const vendorContact = {
    userId: 'u-vend',
    name: 'Vikram Stones',
    phone: '9123456780',
    email: 'vikram@example.com',
    role: Role.VENDOR,
    isActive: true,
    isApproved: true,
    lastLoginAt: null,
  };

  beforeEach(() => {
    orders = [
      order({
        id: 'o1',
        capturedPaise: 50000,
        hireRequestId: 'h1111111-1111-4111-8111-111111111111',
        deliveryAddress: {
          id: 'd1',
          customerId: 'c1',
          label: 'Home',
          addressLine1: '12 MG Road',
          addressLine2: 'Flat 4B, 2nd floor',
          city: 'Bengaluru',
          pincode: '560001',
          lat: 12.97,
          lng: 77.59,
          isDefault: true,
          createdAt: '2026-11-01T00:00:00.000Z',
          updatedAt: '2026-11-01T00:00:00.000Z',
        },
        vendorGroups: [
          {
            id: 'g1',
            orderId: 'o1',
            vendorId: 'v1',
            shopName: 'Stone Mart',
            subtotal: 500,
            loadingUnloadingFee: 0,
            status: 'confirmed',
            items: [],
            vendor: vendorContact,
            createdAt: '2026-11-01T10:00:00.000Z',
            updatedAt: '2026-11-03T15:30:00.000Z',
          },
        ],
      }),
    ];
    refunds = {
      o1: [
        refund({
          rail: 'manual_payout',
          orderVendorGroupId: 'g1',
          razorpayPaymentId: 'pay_rzp1',
          receipt: 'rf_o1_1',
          razorpayRefundId: 'rfnd_123',
          payoutReference: 'UTR998877',
        }),
      ],
    };
    refundBodies = [];
    refundListFetches = 0;
    refundsGate = null;
    refundsListFails = false;
    refundPostGate = null;
    ordersListFetches = 0;
    useHandlers();
    server.use(
      http.get(`${BASE}/:id/payment-events`, () =>
        HttpResponse.json({
          success: true,
          data: [
            {
              id: 'e1',
              orderId: 'o1',
              eventType: 'payment.captured',
              eventId: 'evt_RZP789',
              rawPayload: { payment: { entity: { method: 'upi', vpa: 'asha@okbank' } } },
              createdAt: '2026-11-01T10:05:00.000Z',
            },
          ],
        }),
      ),
    );
  });

  it('lists the customer and the amount actually paid', async () => {
    renderPage();

    const row = await screen.findByRole('row', { name: /Asha Rao/ });
    expect(row).toHaveTextContent('98765 43210');
    expect(row).toHaveTextContent('₹500.00');
  });

  it('shows the customer, each vendor, Razorpay ids, hire request and a map link', async () => {
    renderPage();
    const user = userEvent.setup();

    await user.click(await screen.findByRole('row', { name: /Asha Rao/ }));

    const customer = screen.getByRole('group', { name: 'Customer' });
    expect(customer).toHaveTextContent('Asha Rao Kumar');
    expect(customer).toHaveTextContent('asha@example.com');
    const vendor = screen.getByRole('group', { name: 'Vendor: Stone Mart' });
    expect(within(vendor).getByRole('link', { name: '91234 56780' })).toHaveAttribute(
      'href',
      'tel:9123456780',
    );
    expect(vendor).toHaveTextContent('Last changed');
    const payment = screen.getByRole('group', { name: 'Payment' });
    expect(payment).toHaveTextContent('order_rzp1');
    expect(payment).toHaveTextContent('pay_rzp1');
    expect(payment).toHaveTextContent('h1111111-1111-4111-8111-111111111111');
    expect(screen.getByRole('link', { name: 'Open in Maps' })).toHaveAttribute(
      'href',
      'https://maps.google.com/?q=12.97,77.59',
    );
  });

  it('shows who created each refund and its payout details', async () => {
    renderPage();
    const user = userEvent.setup();

    await user.click(await screen.findByRole('row', { name: /Asha Rao/ }));

    const history = await screen.findByText(/Admin Priya/);
    expect(history).toBeInTheDocument();
    expect(screen.getByText(/UTR998877/)).toBeInTheDocument();
    expect(screen.getByText(/rfnd_123/)).toBeInTheDocument();
    expect(screen.getByText(/Manual payout/)).toBeInTheDocument();
    expect(screen.getByText(/for Stone Mart/)).toBeInTheDocument();
    expect(screen.getByText(/payment pay_rzp1/)).toBeInTheDocument();
  });

  it('lets the admin read a payment event’s raw data', async () => {
    renderPage();
    const user = userEvent.setup();

    await user.click(await screen.findByRole('row', { name: /Asha Rao/ }));
    await user.click(screen.getByRole('button', { name: 'Show payment events' }));

    expect(await screen.findByText(/payment\.captured/)).toBeInTheDocument();
    expect(screen.getByText(/asha@okbank/, { exact: false })).toBeInTheDocument();
    expect(screen.getByText(/evt_RZP789/)).toBeInTheDocument();
  });
});

// Task 4d review (decision 0058): every stored order fact the admin may need.
describe('OrdersPage full order facts', () => {
  beforeEach(() => {
    orders = [
      order({
        id: 'o9999999-9999-4999-8999-999999999999',
        capturedPaise: null,
        status: 'confirmed',
        grandTotal: 750,
        deliveryAddress: {
          id: 'd1',
          customerId: 'c1',
          label: 'Site',
          addressLine1: '7 Lake View',
          addressLine2: 'Flat 4B, 2nd floor',
          city: 'Pune',
          pincode: '411001',
          lat: 18.52,
          lng: 73.85,
          isDefault: true,
          createdAt: '2026-11-01T00:00:00.000Z',
          updatedAt: '2026-11-01T00:00:00.000Z',
        },
      }),
    ];
    refunds = {};
    refundBodies = [];
    refundListFetches = 0;
    refundsGate = null;
    refundsListFails = false;
    refundPostGate = null;
    ordersListFetches = 0;
    useHandlers();
  });

  it('lists the Razorpay payment id', async () => {
    renderPage();
    expect(await screen.findByRole('row', { name: /pay_rzp1/ })).toBeInTheDocument();
  });

  it('shows the full ids, the whole address and lets the admin copy an id', async () => {
    renderPage();
    const user = userEvent.setup();

    await user.click(await screen.findByRole('row', { name: /Asha Rao/ }));

    const payment = screen.getByRole('group', { name: 'Payment' });
    expect(payment).toHaveTextContent('o9999999-9999-4999-8999-999999999999');
    expect(screen.getByText(/Flat 4B, 2nd floor/)).toBeInTheDocument();
    expect(screen.getByText(/18\.52, 73\.85/)).toBeInTheDocument();
    expect(screen.getByText(/default address/)).toBeInTheDocument();
    await user.click(within(payment).getByRole('button', { name: 'Copy Razorpay payment' }));
    // userEvent.setup() provides the clipboard; read back what was copied.
    expect(await navigator.clipboard.readText()).toBe('pay_rzp1');
  });

  it('does not call an old confirmed order "not captured"', async () => {
    renderPage();
    const user = userEvent.setup();

    await user.click(await screen.findByRole('row', { name: /Asha Rao/ }));

    const payment = screen.getByRole('group', { name: 'Payment' });
    expect(payment).not.toHaveTextContent('Not captured');
    expect(payment).toHaveTextContent('Not recorded (assumed ₹750)');
  });
});

// Decision 0058 Task 7: the user popup links to one customer's orders.
describe('OrdersPage for one customer', () => {
  beforeEach(() => {
    orders = [order({ id: 'o1', status: 'confirmed', grandTotal: 500 })];
    refunds = {};
    ordersListFetches = 0;
  });

  it('asks the server for that customer’s orders and offers the way back to all', async () => {
    const urls: string[] = [];
    server.use(
      http.get(BASE, ({ request }) => {
        urls.push(request.url);
        return HttpResponse.json({ success: true, data: orders });
      }),
    );

    renderPage('/orders?customerId=c-9');

    expect(await screen.findByText(/Showing one customer’s orders/)).toBeInTheDocument();
    expect(new URL(urls[0]).searchParams.get('customerId')).toBe('c-9');
    expect(screen.getByRole('link', { name: 'Show all orders' })).toHaveAttribute(
      'href',
      '/orders',
    );
  });

  it('asks for everyone’s orders without the filter', async () => {
    const urls: string[] = [];
    server.use(
      http.get(BASE, ({ request }) => {
        urls.push(request.url);
        return HttpResponse.json({ success: true, data: orders });
      }),
    );

    renderPage('/orders');

    await screen.findByRole('row', { name: /Asha Rao/ });
    expect(new URL(urls[0]).searchParams.has('customerId')).toBe(false);
    expect(screen.queryByText(/Showing one customer’s orders/)).not.toBeInTheDocument();
  });
});
