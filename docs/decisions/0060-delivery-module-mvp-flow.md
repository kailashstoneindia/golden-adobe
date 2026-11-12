# 0060 — Delivery module: MVP flow (in-house team)

- **Date:** 2026-11-10
- **Status:** Accepted and built (pending merge) — branch `feat/delivery-module`, S1-S9 done; client answers still open (see Open follow-ups)
- **Supersedes / Superseded by:** Supersedes [0047](0047-delivery-module-flagged.md)

## Context

The client runs an in-house delivery team and wants it on the platform
([0035](0035-client-feedback-triage-2026-10-18.md) #4: drivers, co-drivers, a driver onboarding
dashboard, an operations role that inspects orders in transit). This is new scope beyond the signed
proposal. [0047](0047-delivery-module-flagged.md) recorded it with every design question open.

Today's code, checked 2026-11-10:

- `OrderVendorGroupStatus` is `PENDING → CONFIRMED → SHIPPED → DELIVERED | CANCELLED`
  (`orders/models/order-vendor-group.model.ts`). The vendor moves their own group through
  `PATCH /vendors/order-groups/:id/status` (`orders.service.ts` `updateVendorGroupStatus`),
  **including to `DELIVERED`**.
- `Role` is `CUSTOMER | VENDOR | ARTISAN | ADMIN` (`packages/types/src/role.enum.ts`). No driver role.
- `orders.delivery_address_id` points at the **live** `customer_address` row, so a later edit by the
  customer changes where the driver goes.
- `NotificationService` only logs (`LogNotificationService`). No push or SMS goes out.
- Artisan document upload (`artisans.service.ts`: presign, then confirm) is a working S3 pattern to reuse.
- Delivery OTP and open-box photo were client-specified in June ([0042](0042-cart-and-order-structure.md)).

## Decisions (from the 2026-11-10 discussion)

| # | Question | Answer | Source |
|---|---|---|---|
| 1 | Do all orders go through the in-house team? | **Yes. Every order is delivered by the in-house team.** No per-vendor self-delivery flag. | User |
| 2 | Keep the customer delivery OTP? | **Yes, pending client confirmation.** Build with a **dummy OTP** for testing. | User |
| 3 | Where do goods go after a failed delivery? | **Open. Will be asked of the client.** | User |
| 4 | Is the helper (co-driver) a separate login or a name on the assignment? | **No separate login.** The helper is assigned to a driver and the driver's profile shows the helper's **name and phone number**. Nothing more. | User |
| 5 | Driver onboarding documents | **Licence and Aadhaar.** If a vehicle is assigned to the driver, show its details too. Vehicles belong to the client, so the driver does not submit vehicle documents. | User |

## Agreed flow

Per `OrderVendorGroup`:

```
CONFIRMED → READY_FOR_PICKUP → SHIPPED → DELIVERED
                                  └→ DELIVERY_FAILED → (re-attempt) SHIPPED
```

1. Vendor marks the group **Packed & ready** → `READY_FOR_PICKUP` (new status).
2. Ops (admin panel) sees a delivery queue of ready groups and **assigns a driver**.
3. The assignment lives on a new `delivery_assignment` record, not as a customer-visible status.
4. Driver app lists "My deliveries" with pickup address, vendor phone, drop address, customer phone,
   item list.
5. Driver loads at the shop. The vendor can mark **Handed over**, with an optional photo, as supporting evidence.
6. Driver taps **Picked up**, ticking the item list → `SHIPPED`. The driver's tap moves the order.
   The vendor's "Handed over" does not.
7. Customer receives an **"Out for delivery" notification with a 6-digit OTP**.
8. On site the driver gets the OTP from the customer, uploads a **required delivery photo**, and
   completes → `DELIVERED`.
9. If delivery fails the driver records a reason and a photo → `DELIVERY_FAILED`. Ops re-attempts or
   returns the goods (rules pending decision 3).

## Calls made by me (not yet confirmed by the user)

- **Vendors lose the ability to set `SHIPPED` and `DELIVERED`.** Delivery state is written only by the
  driver or ops. Keeps one source of truth now that all delivery is in-house.
- **Copy the delivery address onto the order at checkout** (snapshot) instead of pointing at the live row.
- **Drivers are created by ops using a phone number**, then log in with the existing phone OTP.
  No self-registration, same as admin accounts today.
- **Driver app refreshes by pull.** No push notifications in the MVP, because the notification service is log-only.
- A refunded or cancelled order shows a **Stop** state in the driver app, reusing `LOCKED_PARENT_ORDER_STATUSES`.
- **Helper is a standing pairing.** I read "assign the helper to the driver" as a pairing stored on the
  driver (helper name and phone), editable by ops, and shown on every job the driver sees. The helper
  has no login and cannot tap any delivery step; the driver does all of them. Ops can change the pairing
  when a different helper rides along. If the helper changes per delivery instead, the same fields
  move onto `delivery_assignment`.
- **Dummy OTP for testing:** a fixed value in non-production, as the login OTP does (`123456`). Real
  generation and SMS only after the client confirms and a DLT template is registered.

## Build documents (written 2026-11-10)

- Technical design: [../superpowers/specs/2026-11-10-delivery-module-design.md](../superpowers/specs/2026-11-10-delivery-module-design.md)
- Session-by-session plan: [../superpowers/plans/2026-11-10-delivery-module/00-README.md](../superpowers/plans/2026-11-10-delivery-module/00-README.md)
- Mobile API contract: [../delivery-mobile-api-contract.md](../delivery-mobile-api-contract.md)

Further calls made while designing (also listed in the spec): the OTP is stored in plain text and shown in the
customer app because SMS is log-only; failure photo is required; the Aadhaar number is never stored, only the
document image; a re-attempt after a failed delivery assumes the goods are still on the truck, which is the
default until the client answers decision 3.

## Out of scope for the MVP

Live GPS tracking, route batching and optimisation, automatic assignment, push notifications,
driver payouts, delivery fee to the customer, customer-facing tracking beyond the status label.

- **Driver API details (S5).** A job is `blocked` (STOP) only while it is open (`assigned` or `picked_up`); a finished job in a later-refunded order shows as normal history. A wrong OTP is counted in its own committed write, so the 400 cannot roll the count back; the 5th wrong try returns 403 and the job stays locked even for the right code. The photo key is checked before the OTP, so a bad upload never burns an attempt. Marking a delivery failed does not notify the customer yet (S6 decides the wording). A job's item unit is the product's unit-of-measure code, or `unit` when none is set.

- **Vendor, customer and notification details (S6).** Handover is a marker on the open assignment (`vendor_handed_over_at`, optional photo); the group status does not change and a repeat call keeps the first timestamp. Another vendor's group is a 404, not a 403. The customer sees `deliveryOtp` only while the group is `shipped`, taken from the open `picked_up` assignment; vendor, admin and artisan views never carry it. The driver is notified on assign and reassign. A failed delivery still does not notify the customer: the app already shows "Delivery attempt failed (we will contact you)" and ops follow up by phone, so no extra wording was invented.

- **Admin delivery UI details (S8).** The order modal lists delivery attempts through a new `orderId` filter on `GET /admin/delivery/assignments`, not through the admin order DTO, so photo links keep being signed in one place. Assign shows "Already assigned" on a 409 and refreshes the queue. Reassign hides the current driver; re-attempt may pick the same driver again, as the API allows.

## Open follow-ups

| Item | Blocked on | Notes |
|---|---|---|
| Failed-delivery goods handling (decision 3) | Client answer | Options: back to vendor, hold in a warehouse, stay on the truck for the next attempt. Shapes the `DELIVERY_FAILED` follow-up states. |
| Helper pairing detail (decision 4) | Minor, my call below | Whether the helper is a standing pairing on the driver or picked per delivery. Built as a standing pairing that ops can change. |
| Helper identity check | Client answer | Helpers have no Aadhaar or licence check in the MVP. Ask the client if they want one. |
| Delivery OTP confirmed by client (decision 2) | Client answer | Needs a new DLT SMS template if kept. |
| Relation to the loading/unloading fee ([0036](0036-vendor-loading-unloading-capability.md)) | Client answer | Who unloads at the site: the driver, the helper, or the customer. Rate is still ₹0. |
| Delivery fee for customers | Client answer | Checkout charges none today. |
| Push notifications to drivers | Notification provider work | Log-only today. |
| Driver notice on re-attempt | My call | `reattempt` does not call `sendDeliveryAssigned`; the driver app pulls its list. Add it if drivers miss re-attempt jobs. |
| Customer notice on failed delivery | Client answer | Wording and channel not agreed; ops phone the customer today. |
| Cost and timeline for the client | Estimate | Needs its own estimate, not absorbed into Phase 3 or 4 ([0035](0035-client-feedback-triage-2026-10-18.md)). |

## Consequences

- New statuses `READY_FOR_PICKUP` and `DELIVERY_FAILED` on `order_vendor_group`; the vendor transition
  table in `orders.service.ts` changes, so existing vendor-app behaviour for `SHIPPED` and `DELIVERED` changes.
- The mobile app is owned by a fellow developer. The driver screens and the vendor "Packed & ready"
  button are theirs to build, so the API contract must be agreed with them before backend work starts.
- A new `DRIVER` role (and a driver profile with licence and Aadhaar) is needed. Role enum changes
  ripple through the shared `@golden-abode/types` package.
- Photo uploads reuse the S3 presign pattern; a new key prefix for delivery photos is needed.

## Sources

- [0047](0047-delivery-module-flagged.md), [0035](0035-client-feedback-triage-2026-10-18.md),
  [0042](0042-cart-and-order-structure.md), [0036](0036-vendor-loading-unloading-capability.md),
  [0045](0045-artisan-hire-lifecycle-and-order-attribution.md)
- `apps/backend/src/modules/orders/orders.service.ts`, `orders/models/order-vendor-group.model.ts`,
  `orders/models/order.model.ts`, `artisans/artisans.service.ts`, `notifications/notification.interface.ts`
- Flow diagram: https://claude.ai/artifact/ANFpvUQiQVesyTd5ucn45W
