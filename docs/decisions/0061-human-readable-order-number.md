# 0061 — Human-readable order number

- **Date:** 2026-11-20
- **Status:** Accepted and built (pending merge, ships with [0060](0060-delivery-module-mvp-flow.md))
- **Supersedes / Superseded by:** —

## Context

An order was identified only by its UUID. Ops, drivers and customers had nothing short to say on a
phone call ("which order?"), and the admin panel showed the first 8 characters of the UUID, which is
not a stable thing to quote. Delivery makes this worse: ops phone the customer after a failed delivery
and a driver must find the right job.

## Options considered

### Option A — Keep the UUID, show a shortened form

- **Pro:** nothing to build.
- **Con:** not unique, not typed easily, changes nothing for customers.

### Option B — A number built in application code (max + 1, or random)

- **Pro:** no schema work beyond a column.
- **Con:** races under concurrent checkouts, so duplicates need retry logic in every code path that
  creates an order.

### Option C — A database sequence with a prefix (chosen)

- **Pro:** unique and gapless in order of creation without any code, every insert path gets one,
  and a unique constraint backs it up.
- **Con:** a sequence can skip numbers after a rolled-back insert (harmless), and the format is fixed
  in the database default.

## Decision

`orders.order_number` is `GA-` plus the next value of the `order_number_seq` sequence, starting at
**10001**, for example `GA-10001`. The column is `NOT NULL`, `UNIQUE`, and defaults to
`'GA-' || nextval('order_number_seq')`, so checkout and every other insert get one without code. The
Sequelize model carries the same default expression. Existing orders were numbered oldest first by the
migration.

The number is **returned** (as `orderNumber`) on the customer order and list, the artisan order, the
admin order, the delivery queue, the admin assignment list, the driver job, and the vendor order-group
list and detail. The admin panel shows it in place of the shortened UUID. The UUID stays the key for
every URL and API path.

## Why

A sequence is the standard way to number rows without races. The prefix leaves room to tell order
numbers apart from other numbers later. Five digits are enough for a long while and the sequence grows
past five without any change.

## Consequences

- API shapes gain `orderNumber`: `OrderDto`, `ArtisanOrderDto`, `QueueItemDto`, `AdminAssignmentDto`
  and `DeliveryJobDto` (all required), plus a new `VendorOrderGroupWithNumberDto` for vendor routes.
  The older `VendorOrderGroupDto` alias is unchanged because the mobile app uses it.
- The migration `20261120090000-add-order-number-to-orders` must run on every database before the
  new backend starts. It is not reversible without losing the numbers already handed out.
- The delivery contract and the mobile developer guide are updated; the mobile developer should show
  the number instead of any shortened UUID.

## Open questions

| Item                                    | Notes                                                                                                                                  |
| --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Group number (`GA-10001-1`)             | Not built. A multi-vendor order is told apart by vendor name on every screen today. Add it if drivers confuse two groups of one order. |
| Notifications                           | Notification calls still receive the order UUID and are log-only. Use the number in the message text when real templates exist.        |
| Number on invoices or Razorpay receipts | Not changed. Razorpay keeps its own receipt id.                                                                                        |
