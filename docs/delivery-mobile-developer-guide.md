# Delivery module: guide for the mobile developer

Updated 2026-11-20. Branch `feat/delivery-module`, PR #45 (not merged yet). Everything below was checked
against the backend code and an end-to-end test that walks the whole flow over real HTTP.

Related files:

- [delivery-mobile-api-contract.md](delivery-mobile-api-contract.md): the request and response shapes, short form.
- [decision 0060](decisions/0060-delivery-module-mvp-flow.md): why the delivery flow works this way.
- [decision 0061](decisions/0061-human-readable-order-number.md): the new order number.
- Shared types: `packages/types/src/delivery.types.ts` and `order.types.ts` (`DeliveryJobDto`,
  `DriverProfileDto`, `DeliveryFailureReason`, `CustomerOrderVendorGroupDto`, `VendorOrderGroupWithNumberDto`).

## 1. What you need to build

| App area                 | What is new                                                                                                  | Size          |
| ------------------------ | ------------------------------------------------------------------------------------------------------------ | ------------- |
| **Driver** (new role)    | Login, job list, job detail, pickup checklist, deliver with code and photo, report a failed delivery         | The big piece |
| **Vendor**               | "Packed & ready" and "Handed to driver" buttons, remove "shipped" and "delivered" buttons, show order number | Small         |
| **Customer**             | Two new order statuses, the delivery code while out for delivery, show order number                          | Small         |
| **Fixes already needed** | See section 2                                                                                                | Quick         |

## 2. Two things that already fail to typecheck in `apps/mobile`

Running `tsc --noEmit` in `apps/mobile` against this branch gives two errors. They come from the shared types
changing, not from your code being wrong, and they are yours to fix:

1. `app/(auth)/register.tsx(120)`: `RegisterableRole` now includes `Role.DRIVER`, but the screen's state type is
   `CUSTOMER | VENDOR | ARTISAN`. Drivers cannot register themselves (ops creates them), so keep `DRIVER` out
   of the register screen's choices and widen or narrow the type to match.
2. `src/constants/order.constants.ts(13)`: the status label map must include the two new group statuses
   `ready_for_pickup` and `delivery_failed` (labels are in section 7).

## 3. The flow

```
 VENDOR              ADMIN PANEL (ops)        DRIVER                      CUSTOMER sees
 ──────              ─────────────────        ──────                      ─────────────
 confirmed ────────────────────────────────────────────────────────────  Order confirmed
 taps "Packed & ready"
 ready_for_pickup ─→ assigns a driver ──────→ job appears (assigned) ───  Packed
 taps "Handed to driver"                       (optional, once assigned)
                                              checks every item loaded
                                              taps "Picked up"
 shipped ──────────────────────────────────────────────────────────────  Out for delivery
                                                                          + 6-digit code shown
                                              customer reads the code
                                              driver enters code + photo
 delivered ────────────────────────────────────────────────────────────  Delivered
                                              ── or ──
                                              "Could not deliver": reason + photo
 delivery_failed ──────────────────────────────────────────────────────  Delivery attempt failed
            ops phone the customer, then start a re-attempt in the admin panel
 shipped (new job, already picked up, new code) ───────────────────────  Out for delivery again
```

Two kinds of status exist. Do not mix them up:

| Kind                                             | Values                                                                                             | Where you see it                                   |
| ------------------------------------------------ | -------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| **Group status** (one vendor's part of an order) | `pending`, `confirmed`, `ready_for_pickup`, `shipped`, `delivered`, `delivery_failed`, `cancelled` | Customer and vendor apps (`vendorGroups[].status`) |
| **Job (assignment) status** (one driver attempt) | `assigned`, `picked_up`, `delivered`, `failed`, `cancelled`                                        | Driver app (`DeliveryJob.status`)                  |

What changes the group status:

| Who and when                                   | Group status becomes |
| ---------------------------------------------- | -------------------- |
| Vendor taps Packed & ready                     | `ready_for_pickup`   |
| Driver pickup                                  | `shipped`            |
| Driver completes with the right code and photo | `delivered`          |
| Driver reports failure                         | `delivery_failed`    |
| Ops re-attempt                                 | `shipped`            |

## 4. Local setup and test data

1. Follow section 1 of [mobile-developer-handover.md](mobile-developer-handover.md): Docker, install,
   migrations, `pnpm dev`. The API is at `http://localhost:3000`.
2. Pull this branch and run the migrations again:
   `pnpm --filter @golden-abode/backend run migration:run`.
   Three new migrations matter: delivery tables, delivery address snapshot, order number.
3. Start the admin panel and log in as an admin. On the **Drivers** page create a driver: name, phone in the form
   `+91XXXXXXXXXX`, licence number. A driver cannot sign up in the app; ops creates them.
4. Log in to the driver app with that phone through the normal phone OTP flow
   (`/auth/otp/send`, then `/auth/otp/verify`). With SMS off, the login code is `123456`. The access token
   carries role `DRIVER`.
5. Place an order as a customer and pay it in test mode. As the vendor, mark the group **Packed & ready**.
6. In the admin panel open **Ready to deliver** and assign your driver. The job now shows in the driver app.

**The customer's delivery code in demo mode.** With SMS off, the code is always `123456`, for every delivery.
With SMS on, it is random per pickup. The customer app is the only place the code is shown either way.

## 5. Conventions you can rely on

- **Success envelope:** `{ "success": true, "data": ... }`. Read `data`.
- **Error envelope:** `{ "success": false, "statusCode": 400, "error": "Bad Request", "message": "..." }`. The
  `message` is safe to show to the driver for the cases in section 9.
- **Auth:** `Authorization: Bearer <accessToken>` on every call. Roles are enforced: a customer, vendor or admin
  token on a `/driver/...` route gets 403, and a driver token on vendor or admin routes gets 403.
- **IDs:** the UUID `id` is the key for paths and requests. Never show a UUID to people; show `orderNumber`.
- **Timestamps:** ISO 8601 strings in UTC.
- **`:id` on driver routes is the assignment id** (`DeliveryJob.id`), not the order id and not the group id.

## 6. Order number (new)

Every order has a short number such as `GA-10001`, returned as `orderNumber`. Show it wherever an order is
named, and when quoting an order to support. Where it appears:

| Response                                                  | Field                       |
| --------------------------------------------------------- | --------------------------- |
| `GET /orders`, `GET /orders/:id` (customer; also artisan) | `orderNumber`               |
| `GET /driver/deliveries`, `/driver/deliveries/:id`        | `orderNumber`               |
| `GET /vendors/order-groups`, `/vendors/order-groups/:id`  | `orderNumber` on each group |

There is no separate number per vendor group. A multi-vendor order shows the same `orderNumber` on each of its
groups, and the vendor name tells them apart.

## 7. Customer app

`GET /orders` and `GET /orders/:id` return `vendorGroups[]`. Each group now has:

- `status` with two new values, `ready_for_pickup` and `delivery_failed`;
- `deliveryOtp: string | null`, set **only while the group is `shipped`**. It is `null` before pickup and after
  delivery or failure.

Suggested labels:

| `status`           | Label                                         |
| ------------------ | --------------------------------------------- |
| `pending`          | Awaiting confirmation                         |
| `confirmed`        | Order confirmed                               |
| `ready_for_pickup` | Packed                                        |
| `shipped`          | Out for delivery                              |
| `delivered`        | Delivered                                     |
| `delivery_failed`  | Delivery attempt failed (we will contact you) |
| `cancelled`        | Cancelled                                     |

On the tracking screen, while `shipped` and `deliveryOtp` is set, show it large:
"Tell the driver this code when your order arrives: 123456".

Refresh behaviour: there is no push yet. Refetch the order when the screen opens or the user pulls down, and
consider polling every 30 to 60 seconds while the tracking screen is open. After a **re-attempt** the code
changes, so always show the latest `deliveryOtp` and never cache an old one.

Unchanged for customers: orders and cancellations behave as before. A customer cannot see the driver, vehicle or
photos.

## 8. Vendor app

| Screen                  | Call                                                                                  | Notes                                                                                                                                                                                                        |
| ----------------------- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Order list and detail   | `GET /vendors/order-groups`, `GET /vendors/order-groups/:id`                          | Groups now carry `orderNumber` and the new statuses.                                                                                                                                                         |
| **Packed & ready**      | `PATCH /vendors/order-groups/:id/status` with `{ "status": "ready_for_pickup" }`      | Only valid from `confirmed`. Returns the updated group.                                                                                                                                                      |
| **Handed to driver**    | `POST /vendors/order-groups/:id/handover` with `{ "photoKey": "..." }` (key optional) | Needs a driver assigned, otherwise 400 `no driver assigned yet`. Safe to call twice: the first timestamp is kept. Returns `{ groupId, vendorHandedOverAt }` with HTTP 200. The group status does not change. |
| Optional handover photo | `POST /vendors/order-groups/:id/photo-url` with `{ "contentType": "image/jpeg" }`     | Same upload recipe as section 10. HTTP 201.                                                                                                                                                                  |

**Vendors can no longer do these.** The API rejects `shipped` and `delivered` from a vendor, and rejects
anything from `ready_for_pickup` onwards except through the driver flow. Allowed vendor transitions are exactly:

| From        | To                              |
| ----------- | ------------------------------- |
| `pending`   | `confirmed`, `cancelled`        |
| `confirmed` | `ready_for_pickup`, `cancelled` |

Remove any "Mark shipped" and "Mark delivered" buttons.

**The shared map is now correct.** `ORDER_VENDOR_GROUP_NEXT_STATUSES` in `@golden-abode/types` was fixed on this
branch to match the API: it offers `confirmed` to `ready_for_pickup` or `cancelled`, and nothing after packing. So
`VendorStatusActions.tsx` can keep building its buttons from it, and a packed group will simply show no actions.
Pull the latest `@golden-abode/types` build.

Handover is a courtesy record: it never blocks the driver from picking up. The driver sees
`vendorHandedOverAt` on the job once it is set. It stays set if ops reassign the job to another driver. Handover
is refused (400, the "order is refunded, being refunded or cancelled" message) once the order is refunded or cancelled.

## 9. Driver app

### 9.1 Login and profile

Login is the normal phone OTP flow with the phone ops registered (`+91XXXXXXXXXX`). The token has role `DRIVER`.
A phone that is not a driver account follows the usual flow; there is no driver self-registration.

`GET /driver/me` returns a `DriverProfile`:

```json
{
  "id": "…",
  "name": "Ramesh Kumar",
  "phone": "+919876543210",
  "helper": { "name": "Suresh", "phone": "+919800000001" },
  "vehicle": { "registrationNumber": "UP32AB1234", "type": "Mini truck" }
}
```

`helper` and `vehicle` can each be `null`. The helper is a standing pairing set by ops; helpers do not log in.

### 9.2 Job list

`GET /driver/deliveries?scope=active|history`. The default is `active` (jobs in `assigned` or `picked_up`).
`history` shows finished jobs (`delivered`, `failed`, `cancelled`). Any other `scope` is 400. Returns an array of
`DeliveryJob`, newest first.

There is **no push notification**. The list must be refreshed by the app: pull to refresh, refetch when the app
returns to the foreground, and poll about once a minute while the list is open. A new assignment or a
re-attempt shows up only on the next fetch.

### 9.3 The job

```json
{
  "id": "assignment-uuid",
  "status": "assigned",
  "attemptNo": 1,
  "blocked": false,
  "blockedReason": null,
  "orderId": "…",
  "orderNumber": "GA-10032",
  "groupId": "…",
  "pickup": {
    "vendorName": "Kailash Stones",
    "address": "Plot 4, Industrial Area, Delhi",
    "lat": 28.7041,
    "lng": 77.1025,
    "phone": "+919811111111"
  },
  "drop": {
    "recipientName": "Asha Rao",
    "phone": "+919822222222",
    "addressLine1": "12 MG Road",
    "addressLine2": null,
    "city": "Delhi",
    "pincode": "110001",
    "lat": null,
    "lng": null
  },
  "items": [{ "orderItemId": "…", "name": "Marble tile 2x2", "quantity": 40, "unit": "Box" }],
  "vendorHandedOverAt": null,
  "pickedUpAt": null,
  "deliveredAt": null,
  "failedAt": null,
  "failureReason": null
}
```

Notes on fields:

- **`drop` is the address frozen at checkout.** Editing the customer's saved address later does not change it.
- **`lat` and `lng` can be `null`** for pickup or drop. Then show the address and offer no map button.
- **`unit`** can be empty when the product has no unit of measure.
- **`blocked: true`** means the order was refunded or cancelled while the job was open. Show a STOP banner with
  `blockedReason` ("This order was refunded or cancelled. Do not deliver it."), and hide the pickup, deliver and
  fail buttons. The server rejects those actions with 400 anyway. A blocked job is only ever `assigned` or `picked_up`.
- **`attemptNo`** is 1 for the first try. After a failed delivery and a re-attempt it is 2, and so on. Show
  "Attempt 2" so the driver knows it is a repeat.

### 9.4 Actions

| Action            | Call                                    | Succeeds when                                                                   | HTTP |
| ----------------- | --------------------------------------- | ------------------------------------------------------------------------------- | ---- |
| Pick up           | `POST /driver/deliveries/:id/pickup`    | Job is `assigned`, the group is `ready_for_pickup`, every item confirmed loaded | 201  |
| Ask for upload    | `POST /driver/deliveries/:id/photo-url` | Always for the driver's own job                                                 | 201  |
| Deliver           | `POST /driver/deliveries/:id/complete`  | Job is `picked_up`, the code is right, the photo exists                         | 201  |
| Could not deliver | `POST /driver/deliveries/:id/fail`      | Job is `picked_up`, valid reason, the photo exists                              | 201  |

Each action returns the updated `DeliveryJob`.

**Pickup.** Body: `{ "items": [{ "orderItemId": "…", "loaded": true }] }`. Send **every** item of the job, all with
`loaded: true`. If one is missing or false the server answers 400
`confirm every item of the order as loaded before leaving`. So the checklist screen should keep the
button disabled until every box is ticked. On success the group becomes `shipped` and the customer's code appears.

**Deliver.** Body: `{ "otp": "123456", "photoKey": "…" }`. `otp` must be exactly 6 digits (otherwise 400 from
validation). Wrong code behaviour:

| Situation                 | Response                                                                    |
| ------------------------- | --------------------------------------------------------------------------- |
| Wrong code (tries 1 to 4) | 400 `That code is not correct`. The try is counted.                         |
| 5th wrong code            | **403** `Too many wrong codes. This delivery is locked, contact ops.`       |
| Any call after the lock   | 403, even with the right code, until ops unlock the job in the admin panel. |

Show the attempts left only if you count them locally; the server does not return a counter. On 403 show a
dead-end screen ("Locked, contact ops") with no code field. When ops unlock the job, the customer gets a **new**
code and the driver's tries reset, so the driver just refreshes and asks the customer for the new code. The job
stays with the same driver and there is nothing new to call.

**Could not deliver.** Body: `{ "reason": "customer_unavailable", "photoKey": "…", "note": "optional, 500 characters at most" }`.
`reason` is one of `customer_unavailable`, `site_inaccessible`, `customer_refused`, `goods_damaged`, `other`.
Suggested labels: Customer unavailable, Site inaccessible, Customer refused, Goods damaged, Other. A photo is
required, so make the photo step part of this screen. After success the job is `failed` and the group is
`delivery_failed`.

**Re-attempt.** Ops start it in the admin panel, with the same driver or another one. The new job shows up in
`GET /driver/deliveries` **already `picked_up`**, with `attemptNo` 2 and a fresh customer code. There is no second
pickup step, because the goods stay on the truck. The driver then goes straight to deliver or fail again.
Because there is no push, the driver only sees it after a refresh.

**What the driver cannot do:** see other drivers' jobs (404), pick up a job that is not `assigned`, deliver a job
that was never picked up, or act on a job that is `blocked`.

### 9.5 Recommended screens

| Screen            | Content                                                                                                                                            |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Jobs              | Tabs Active and History. Each row: order number, vendor name, drop city, status chip, attempt badge.                                               |
| Job detail        | Pickup block (vendor, address, call, map), drop block (recipient, address, call, map), item list, handover tick, status. STOP banner when blocked. |
| Pickup            | Item checklist, all must be ticked, then "Picked up".                                                                                              |
| Deliver           | Code field (6 digits), photo capture, "Delivered".                                                                                                 |
| Could not deliver | Reason picker, optional note, photo capture, "Report".                                                                                             |

## 10. Uploading a photo (driver, and optional for the vendor)

The upload goes straight from the phone to S3, not through the API.

1. Ask for an upload: `POST /driver/deliveries/:id/photo-url` with
   `{ "kind": "delivered" | "failed", "contentType": "image/jpeg" | "image/png" }`. For the vendor use
   `POST /vendors/order-groups/:id/photo-url` with `{ "contentType": "image/jpeg" | "image/png" }`.
   Any other content type is 400.
2. The response `data` is `{ "url": "…", "fields": { … } }`. Send a `multipart/form-data` **POST** to `url`
   containing **every** entry of `fields` in the given order, and the `file` field **last**. The link is valid for
   5 minutes and the file may be at most 10 MB. A successful upload answers 204 from S3.
3. Keep `fields.key`. That is the `photoKey` for the next call (`complete`, `fail` or `handover`).
4. If `complete` or `fail` answers 400 `no uploaded photo found for this key`, the upload did not land: retry the
   upload, not the code. A key that belongs to another delivery or to the other kind (for example a "failed"
   key sent to `complete`) is rejected with 400 `photoKey does not belong to this delivery`. Always request a
   fresh upload for each action.

Sketch for React Native:

```ts
const ticket = await api.post(`/driver/deliveries/${id}/photo-url`, {
  kind: 'delivered',
  contentType: 'image/jpeg',
});
const form = new FormData();
Object.entries(ticket.fields).forEach(([k, v]) => form.append(k, v as string)); // keep the order
form.append('file', { uri: photo.uri, name: 'proof.jpg', type: 'image/jpeg' } as never); // last
const res = await fetch(ticket.url, { method: 'POST', body: form });
if (!res.ok) throw new Error('upload failed');
await api.post(`/driver/deliveries/${id}/complete`, { otp, photoKey: ticket.fields.key });
```

Do not set the `Content-Type` header yourself on the upload request; let `FormData` add the boundary.

## 11. Errors you should handle

| Status | Typical `message`                                                                                                  | What the app does                                                                      |
| ------ | ------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------- |
| 400    | `the vendor has not marked this order ready for pickup`                                                            | Show it, offer a refresh                                                               |
| 400    | `confirm every item of the order as loaded before leaving`                                                         | Keep the checklist open                                                                |
| 400    | `That code is not correct`                                                                                         | Let the driver retype the code                                                         |
| 400    | `no uploaded photo found for this key` / `photoKey does not belong to this delivery`                               | Redo the upload                                                                        |
| 400    | `only an assigned job can be picked up` / `only a job that has been picked up can be completed` / `…marked failed` | Refresh the job, the state moved on                                                    |
| 400    | `order is refunded, being refunded or cancelled, and its groups can no longer be updated`                          | Show the STOP state                                                                    |
| 400    | `no driver assigned yet` (vendor handover)                                                                         | "Waiting for ops to assign a driver"                                                   |
| 400    | validation messages (bad code format, bad reason, note too long)                                                   | Fix the field                                                                          |
| 401    | token expired                                                                                                      | The normal refresh or re-login                                                         |
| 403    | wrong role, or `Too many wrong codes. This delivery is locked, contact ops.`                                       | Role error: sign out. Lock: dead-end screen                                            |
| 404    | `Delivery … not found` (also for another driver's job)                                                             | Go back to the list                                                                    |
| 5xx    | any                                                                                                                | Generic retry message; do not retry `complete` blindly because wrong codes are counted |

## 12. Review findings that were fixed

A code review of PR #45 found ten issues. Nine were fixed on this branch and one was left as it is on purpose (extra database reads, no effect on you). The ones that touch you:

| Issue                                                                                        | What changed for you                                                                       |
| -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| The shared vendor transition map offered buttons that always returned 400                    | Fixed, see section 8                                                                       |
| A job locked by 5 wrong codes could never be freed                                           | Fixed: ops unlock it in the admin panel (section 9.4)                                      |
| Reassigning a job dropped the "vendor handed over" marker                                    | Fixed: it carries over to the new driver                                                   |
| Vendor handover was allowed under a refunded or cancelled order                              | Fixed: it now returns 400                                                                  |
| An admin forcing a group to `shipped` could strand a job that was assigned but not picked up | Fixed: the admin override is refused in that case, so you will not see a job in that state |

## 13. What is not in this release

Push notifications (the apps must refresh), live location, route ordering, helper logins, a warehouse or
return-to-vendor step after a failed delivery, an attempt limit, and an automatic message to the customer when a
delivery fails (ops phone the customer today). Open questions with the client (goods after a failed delivery,
whether the code stays, who unloads, a delivery fee) may change details later, but they do not change the calls
above.

## 14. Test checklist

Driver:

- [ ] Log in with a phone created in the admin panel; the profile shows helper and vehicle (or `null`)
- [ ] Active and History lists; refresh shows a newly assigned job
- [ ] Job detail with and without map coordinates; STOP banner on a blocked job
- [ ] Pickup refused until every item is ticked; refused when the vendor has not packed
- [ ] Deliver with the right code and a photo; wrong code shows the error; 5th wrong code locks
- [ ] Failed delivery with each reason, optional note and photo
- [ ] A re-attempt job appears already picked up with attempt 2 and goes straight to deliver

Vendor:

- [ ] Packed & ready works from `confirmed` only
- [ ] Handed to driver works after an assignment, is refused before one, and a repeat is fine
- [ ] No shipped or delivered buttons; no buttons built from the old shared map

Customer:

- [ ] New labels for `ready_for_pickup` and `delivery_failed`
- [ ] The code shows only while the order is out for delivery, and updates after a re-attempt
- [ ] Order number shown everywhere an order is named
