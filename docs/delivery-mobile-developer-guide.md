# Delivery module: guide for the mobile developer

The delivery backend is built and tested on branch `feat/delivery-module` (not merged yet). This guide tells you
what to build in the app and which call each screen makes. Exact request and response shapes are in
[delivery-mobile-api-contract.md](delivery-mobile-api-contract.md); the design reasons are in
[decision 0060](decisions/0060-delivery-module-mvp-flow.md).

You build three things in `apps/mobile`:

| App area                       | What is new                                                                                         |
| ------------------------------ | --------------------------------------------------------------------------------------------------- |
| **Driver** (new role `DRIVER`) | Login, job list, job detail, pickup checklist, deliver with OTP and photo, report a failed delivery |
| **Vendor**                     | "Packed & ready" button, "Handed to driver" confirmation (optional photo)                           |
| **Customer**                   | Two new order statuses, and the delivery code shown while the order is out for delivery             |

## 1. The flow

```
 VENDOR            ADMIN PANEL (ops)       DRIVER                    CUSTOMER sees
 ──────            ─────────────────       ──────                    ─────────────
 confirmed ─────────────────────────────────────────────────────────  Order confirmed
 tap "Packed & ready"
 ready_for_pickup ──→ assigns a driver ───→ job appears (assigned) ──  Packed
 tap "Handed to driver"                      (optional, any time
                                              after assignment)
                                            checks every item loaded
                                            tap "Picked up"
 shipped ──────────────────────────────────────────────────────────  Out for delivery
                                                                      + 6-digit code shown
                                            customer reads the code
                                            driver enters code + photo
 delivered ────────────────────────────────────────────────────────  Delivered
                                            ── or ──
                                            "Could not deliver": reason + photo
 delivery_failed ──────────────────────────────────────────────────  Delivery attempt failed
          ops starts a re-attempt in the admin panel
 shipped (new job, already picked up, new code) ───────────────────  Out for delivery again
```

Group statuses, in order: `confirmed`, `ready_for_pickup`, `shipped`, `delivered`, or `delivery_failed`
(then back to `shipped` on a re-attempt). Job (assignment) statuses: `assigned`, `picked_up`, `delivered`,
`failed`, `cancelled`.

## 2. Run it locally

Follow section 1 of [mobile-developer-handover.md](mobile-developer-handover.md) (Docker, migrations, `pnpm dev`).
Then:

1. Run the migrations again if you pulled this branch: `pnpm --filter @golden-abode/backend run migration:run`.
2. Start the admin panel and log in as an admin. Create a **driver** (Drivers page): name, a phone number, a
   licence number. A driver cannot sign up from the app; ops creates them, and the phone number is the login.
3. Log in to the driver app with that phone through the normal OTP flow (`/auth/otp/send`, `/auth/otp/verify`).
   In demo mode the OTP is `123456`. The token has role `DRIVER`.
4. Place an order as a customer, pay it (test mode), and as the vendor mark it **Packed & ready**.
5. In the admin panel, open **Ready to deliver** and assign your driver. The job now shows in the driver app.

**Order number.** Every order now has a short number such as `GA-10001` (`orderNumber`, see [decision 0061](decisions/0061-human-readable-order-number.md)). Show it wherever an order is named: the driver job, the vendor order list, the customer order list and detail. The UUID `id` stays the key for URLs and API paths; never show it to people.

Shared types: import `DeliveryJobDto`, `DriverProfileDto`, `DeliveryFailureReason` and
`CustomerOrderVendorGroupDto` from `@golden-abode/types` instead of copying shapes.

## 3. Driver app

| Screen            | Call                                                   | Notes                                                                             |
| ----------------- | ------------------------------------------------------ | --------------------------------------------------------------------------------- |
| Home / profile    | `GET /driver/me`                                       | Name, helper, vehicle. Helper and vehicle can be `null`.                          |
| Job list          | `GET /driver/deliveries?scope=active`                  | Default scope. `history` shows finished jobs.                                     |
| Job detail        | `GET /driver/deliveries/:id`                           | `:id` is the **assignment id**, not the order id.                                 |
| Pickup checklist  | `POST /driver/deliveries/:id/pickup`                   | Body lists **every** item with `loaded: true`. The server refuses a partial list. |
| Deliver           | `POST .../photo-url`, upload, then `POST .../complete` | See section 6.                                                                    |
| Could not deliver | `POST .../photo-url`, upload, then `POST .../fail`     | Reason is one of five values. Note is optional (500 characters).                  |

Rules the UI should reflect:

- **Pickup** only works once the vendor has marked the order ready. If the server returns 400 with "the vendor has
  not marked this order ready for pickup", show that message and let the driver refresh.
- **Handover**: `vendorHandedOverAt` on the job is set once the vendor taps "Handed to driver". You can show it as a
  tick; it does not block pickup.
- **Blocked jobs**: when `blocked` is `true` the order was refunded or cancelled. Show a clear STOP banner with
  `blockedReason`, and hide the pickup, deliver and fail buttons. The server returns 400 for them anyway.
- **Wrong code**: 400 on a wrong code, and the attempt is counted. The 5th wrong code returns **403** and locks the
  job ("contact ops"); show a dead-end message, not a retry box. Even the right code is refused after that.
- **Re-attempt**: after a failed delivery, ops starts a re-attempt. The new job (`attemptNo` 2) shows up in the
  list **already `picked_up`** with a new customer code. There is no second pickup step. There is no push yet, so
  pull to refresh, and consider polling the list every minute or so while the app is open.
- **Drop address**: `drop` carries the recipient name, phone, address and lat/lng (lat/lng can be `null`; then show
  the address only). `pickup` has the same for the vendor.

## 4. Vendor app

| Screen                  | Call                                                                                                         | Notes                                                                                                                                                                                                         |
| ----------------------- | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| "Packed & ready" button | `PATCH /vendors/order-groups/:id/status` with `{ "status": "ready_for_pickup" }`                             | Existing endpoint. Vendors can now only do `confirmed` to `ready_for_pickup`, or cancel. `shipped` and `delivered` are rejected for vendors: the driver closes the delivery.                                  |
| "Handed to driver"      | `POST /vendors/order-groups/:id/handover` with `{ "photoKey"? }`                                             | Needs a driver assigned, otherwise 400 "no driver assigned yet" (show "Waiting for ops to assign a driver"). Safe to call twice. Returns `{ groupId, vendorHandedOverAt }`. The group status does not change. |
| Optional handover photo | `POST /vendors/order-groups/:id/photo-url` with `{ "contentType" }`, upload, then send the key in `handover` | Same upload recipe as section 6.                                                                                                                                                                              |

Replace any old "mark shipped" or "mark delivered" buttons: those transitions no longer exist for vendors.

## 5. Customer app

`GET /orders` and `GET /orders/:id` return `vendorGroups[]`. Each group now has:

- `status` with two new values, `ready_for_pickup` and `delivery_failed`;
- `deliveryOtp: string | null`, set **only while the group is `shipped`**. Show it prominently on the tracking
  screen: "Tell the driver this code when your order arrives". It is `null` before pickup and after delivery.

Suggested labels:

| `status`           | Label                                         |
| ------------------ | --------------------------------------------- |
| `confirmed`        | Order confirmed                               |
| `ready_for_pickup` | Packed                                        |
| `shipped`          | Out for delivery                              |
| `delivered`        | Delivered                                     |
| `delivery_failed`  | Delivery attempt failed (we will contact you) |

SMS for the code is not live, so the app is the only place the customer sees it. Refresh the order when the app is
opened or pulled down; there is no push for this yet.

## 6. Uploading a photo (driver, and optional for vendor)

1. Ask for an upload: `POST /driver/deliveries/:id/photo-url` with
   `{ "kind": "delivered" | "failed", "contentType": "image/jpeg" | "image/png" }`.
2. The response is `{ url, fields }`. Send a `multipart/form-data` **POST** to `url` containing every entry of
   `fields` in the given order, with the `file` field **last**. The upload link lasts 5 minutes and the file can be
   at most 10 MB.
3. Remember `fields.key`. That is the `photoKey` you send to `complete` or `fail` afterwards.
4. If `complete` or `fail` answers 400 "no uploaded photo found", the upload did not land: retry the upload, not the
   code. A key from another delivery or the other kind is rejected too, so always request a fresh upload per action.

## 7. Errors you should handle

| Status | Meaning                                                           | UI                                                |
| ------ | ----------------------------------------------------------------- | ------------------------------------------------- |
| 400    | Not allowed in the current state, or wrong code, or photo missing | Show the message from the response, offer refresh |
| 401    | Token expired                                                     | Normal refresh or re-login                        |
| 403    | Wrong role, or OTP locked after 5 wrong tries                     | Locked screen ("contact ops")                     |
| 404    | Job not found, or it belongs to another driver or vendor          | Go back to the list                               |

## 8. Not in this release

Push notifications (apps must refresh), live location, route ordering, helper logins, and an automatic customer
notice when a delivery fails (ops phone the customer). Open questions with the client (what happens to goods after a
failed delivery, whether the code stays, who unloads, a delivery fee) may change details later; they do not change
the calls above.

## 9. Checklist

- [ ] Driver login with a phone created in the admin panel
- [ ] Job list, detail, blocked banner
- [ ] Pickup checklist sends every item
- [ ] Deliver with code and photo; handle 400 and the 403 lock
- [ ] Failed delivery with reason, optional note, photo
- [ ] Re-attempt job appears already picked up
- [ ] Vendor: Packed & ready, Handed to driver, old shipped/delivered buttons removed
- [ ] Customer: new labels, code shown only while out for delivery
