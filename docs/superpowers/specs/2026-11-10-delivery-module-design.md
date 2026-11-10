# Delivery module — technical design

- **Date:** 2026-11-10
- **Product decisions:** [decision 0060](../../decisions/0060-delivery-module-mvp-flow.md) (read it first; this file does not repeat it)
- **Plan:** [../plans/2026-11-10-delivery-module/00-README.md](../plans/2026-11-10-delivery-module/00-README.md)
- **Mobile contract:** [../../delivery-mobile-api-contract.md](../../delivery-mobile-api-contract.md)

## Goal

The client's in-house drivers deliver every vendor's part of every order. Ops assigns drivers in the
admin panel. Drivers use the mobile app. Proof of delivery is a customer OTP plus a required photo.

## Scope

In: new `DRIVER` role, drivers, vehicles, assignments, new group statuses, vendor "ready" and
"handed over" actions, driver API, admin delivery queue/board/driver screens, address snapshot.
Out (MVP): live GPS, route batching, auto-assign, push notifications, driver payouts, customer delivery
fee, helper login, helper identity checks, all mobile app code (owned by another developer).

## Actors and what each may do

| Actor | Allowed |
|---|---|
| Vendor | `confirmed → ready_for_pickup`; `confirmed → cancelled`; mark handed over (+optional photo). **No longer** `shipped` or `delivered`. |
| Ops (ADMIN) | Create/edit drivers and vehicles, upload driver documents, assign / reassign / re-attempt, existing admin override. |
| Driver (DRIVER) | See own jobs; pick up; complete with OTP + photo; fail with reason + photo. |
| Customer | Sees status and the delivery OTP while the group is `shipped`. |

## State machine (per `order_vendor_group`)

```
pending → confirmed → ready_for_pickup → shipped → delivered
              │              │              └→ delivery_failed ──(ops re-attempt)──→ shipped
              └→ cancelled   └→ cancelled (admin override only)
```

Shared map (`ORDER_VENDOR_GROUP_NEXT_STATUSES`):
`pending:[confirmed,cancelled]`, `confirmed:[ready_for_pickup,cancelled]`,
`ready_for_pickup:[shipped,cancelled]`, `shipped:[delivered,delivery_failed]`,
`delivery_failed:[shipped,cancelled]`, `delivered:[]`, `cancelled:[]`.

Vendor-allowed subset: `confirmed:[ready_for_pickup,cancelled]`, everything else `[]`.
Every driver/ops transition is rejected when the parent order is in `LOCKED_PARENT_ORDER_STATUSES`
(`orders/refund-status.ts`) with the existing `GROUP_LOCKED_MESSAGE`.

## Data model (all new tables snake_case, uuid PKs, `created_at`/`updated_at`)

**`vehicles`**: `registration_number varchar(32) unique not null`, `type varchar(64) not null`,
`notes varchar(255) null`, `is_active bool default true`.

**`drivers`**: `user_id uuid unique not null → users`, `licence_number varchar(32) not null`,
`licence_doc_key varchar(255) null`, `aadhaar_doc_key varchar(255) null`, `helper_name varchar(128) null`,
`helper_phone varchar(16) null`, `vehicle_id uuid null → vehicles`.
Aadhaar **number is never stored**, only the uploaded document image.

**`delivery_assignments`**: `order_vendor_group_id → order_vendor_group`, `driver_id → drivers`,
`status varchar(16)` (`assigned|picked_up|delivered|failed|cancelled`), `attempt_no int default 1`,
`assigned_by uuid → users`, `assigned_at`, `vendor_handed_over_at null`, `vendor_handover_photo_key null`,
`picked_up_at null`, `pickup_checklist jsonb null`, `delivery_otp varchar(6) null`, `otp_attempts int default 0`,
`delivered_at null`, `delivery_photo_key null`, `failed_at null`, `failure_reason varchar(32) null`,
`failure_note varchar(500) null`, `failure_photo_key null`, `cancelled_at null`.
Partial unique index `uq_delivery_assignment_open` on `(order_vendor_group_id)` where
`status in ('assigned','picked_up')`. Indexes on `(driver_id, status)` and `(status)`.

**`orders`**: add `delivery_address_snapshot jsonb null` =
`{label, addressLine1, addressLine2, city, pincode, lat, lng, recipientName, recipientPhone}`,
written at checkout. Readers use the snapshot when present and fall back to the live address row.

**`users.role`** Postgres enum gains `DRIVER` (precedent: `ALTER TYPE ... ADD VALUE IF NOT EXISTS`
in `20261104090000-add-artisan-response-to-hire-requests.js`).

## Rules

1. **Assign**: group is `ready_for_pickup`, no open assignment, driver's user is active, parent order not locked.
2. **Reassign**: only an `assigned` assignment; old one → `cancelled`, new one → `assigned`.
3. **Pickup** (driver owns it, assignment `assigned`): checklist must list every `order_item` of the group
   with `loaded: true`, otherwise 400 (driver reports to ops). Sets assignment `picked_up`, group `shipped`,
   generates the OTP, notifies the customer.
4. **OTP**: when `USE_MSG91_SMS` is not `true`, the OTP is `'123456'` (same demo switch as login,
   `AuthService.DEMO_OTP`). Otherwise `crypto.randomInt(100000, 1000000)` as a string. Stored in plain text
   because the customer app must display it (SMS is log-only until DLT is live). Single use.
5. **Complete**: assignment `picked_up`; `otp_attempts < 5`; OTP matches (a wrong OTP increments attempts;
   the 5th failure returns 403 "locked, contact ops"); photo key starts with
   `delivery/<groupId>/delivered-` and exists in storage. Sets assignment `delivered`, group `delivered`.
6. **Fail**: assignment `picked_up`; reason in `DELIVERY_FAILURE_REASONS`; photo key rule as above with
   prefix `failed-`. Sets assignment `failed`, group `delivery_failed`.
7. **Re-attempt** (ops, group `delivery_failed`): goods are assumed still on the truck (decision 3 is open
   with the client). Creates a new assignment (`attempt_no + 1`, any active driver) directly in `picked_up`
   with a fresh OTP; group → `shipped`. Isolated in one service method so the rule can change.
8. **Admin override** of a group to any status other than `ready_for_pickup`/`shipped` cancels its open assignment.
9. **Vendor handover**: needs an open assignment; sets `vendor_handed_over_at` (+ optional photo key with prefix
   `handover-`); idempotent. It never changes group status.
10. Photo keys: `delivery/<groupId>/<kind>-<uuid>.<jpg|png>`, kind ∈ `handover|delivered|failed`. Presign
    via `OBJECT_STORAGE.presignPost`; confirm by prefix check plus `storage.head(key)`. Same pattern as
    `ArtisansService.createUploadUrl` / `confirmDocumentUpload`.
11. Driver documents: `drivers/<driverId>/<licence|aadhaar>-<uuid>.<ext>`; admin presigns and confirms;
    admin views via `presignGet` (as `admin-artisans.service.ts:290`).
12. Drivers are created by ops: one transaction creates `users` (role `DRIVER`, `isApproved: true`,
    `isActive: true`) and `drivers`. They then log in with the existing phone OTP. `/auth/register`
    must keep rejecting `DRIVER` self-selection (as it does for `ADMIN`, `auth.service.ts:188`).

## Notifications

Add to `NotificationService` (log-only implementation for now): `sendDeliveryAssigned(driverUserId, assignmentId)`
and `sendDeliveryOtp(customerId, orderId, otp)`. Existing `sendOrderStatusChanged` is also called on every
group status change.

## My calls (not confirmed by the user)

Vendor loses `shipped`/`delivered`; address snapshot; ops creates drivers and uploads their documents;
pull-only driver app; standing helper pairing on the driver; plain-text OTP; failure photo required;
re-attempt keeps goods on the truck; Aadhaar number not stored.
