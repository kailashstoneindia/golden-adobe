import type { OrderDto, RefundDto } from '@golden-abode/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';

import { ERROR_MESSAGES } from '@/constants/error.constants';
import { server } from '@/test/server';

import { OrdersPage } from './OrdersPage';

const BASE = '/api/admin/orders';

function order(over: Partial<OrderDto> = {}): OrderDto {
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
    ...over,
  };
}

function refund(over: Partial<RefundDto> = {}): RefundDto {
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
    createdAt: '2026-11-02T10:00:00.000Z',
    ...over,
  };
}

let orders: OrderDto[];
let refunds: Record<string, RefundDto[]>;
let refundBodies: unknown[];
let refundListFetches: number;
// What the next POST /refund answers, and what it does to the server's refunds.
let refundReply: {
  status: number;
  message?: string;
  recordRefund?: RefundDto;
  orderStatus?: string;
  networkError?: boolean;
};

function useHandlers() {
  server.use(
    http.get(BASE, () => HttpResponse.json({ success: true, data: orders })),
    http.get(`${BASE}/:id/refunds`, ({ params }) => {
      refundListFetches += 1;
      return HttpResponse.json({ success: true, data: refunds[String(params.id)] ?? [] });
    }),
    http.post(`${BASE}/:id/refund`, async ({ params, request }) => {
      refundBodies.push(await request.json());
      const id = String(params.id);
      if (refundReply.recordRefund) {
        refunds[id] = [...(refunds[id] ?? []), refundReply.recordRefund];
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

function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <OrdersPage />
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
    expect(amount).toBeDisabled();
    expect(amount).toHaveValue(300);
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

    const submit = screen.getByRole('button', { name: 'Refund' });
    expect(submit).toBeDisabled();

    await user.type(screen.getByLabelText('Refund reason'), 'Vendor cancelled');
    expect(submit).toBeEnabled();
  });

  it('sends amount in paise and the reason', async () => {
    renderPage();
    const user = userEvent.setup();
    await user.click(await screen.findByText('o1'));

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

    await user.type(screen.getByLabelText('Refund reason'), 'Late payment');
    await user.click(screen.getByRole('button', { name: 'Refund' }));

    await waitFor(() => expect(refundBodies).toHaveLength(1));
    expect(refundBodies[0]).toEqual({ reason: 'Late payment' });
  });

  it('sends one request when Refund is clicked twice before the first settles', async () => {
    renderPage();
    const user = userEvent.setup();
    await user.click(await screen.findByText('o2'));
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

  describe('refund outcome', () => {
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
