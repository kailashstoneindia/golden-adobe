# Delivery module: API contract for the mobile developer

Status: **Built and tested on branch `feat/delivery-module`, not yet merged or deployed** (design: decision 0060). Shapes below match the implementation and the end-to-end test `delivery-flow.e2e.spec.ts`. The mobile developer can start against a local backend now. Paths are relative to the API base used by
the other endpoints. All endpoints need the normal `Authorization: Bearer <accessToken>`. Errors use the
existing error shape.

## 1. Driver app (role `DRIVER`)

Login is the existing phone OTP flow (`/auth/otp/send`, `/auth/otp/verify`). A driver cannot register
themselves; ops creates them. In demo mode the OTP is `123456`.

| Method | Path | Body | Returns |
|---|---|---|---|
| GET | `/driver/me` | | `DriverProfile` |
| GET | `/driver/deliveries?scope=active\|history` | | `DeliveryJob[]` (active = `assigned`, `picked_up`) |
| GET | `/driver/deliveries/:id` | | `DeliveryJob` |
| POST | `/driver/deliveries/:id/pickup` | `{ items: [{ orderItemId, loaded: true }] }` (every item, all true) | `DeliveryJob` |
| POST | `/driver/deliveries/:id/photo-url` | `{ kind: "delivered"\|"failed", contentType: "image/jpeg"\|"image/png" }` | `PresignedPost` (upload to S3, keep the `key`) |
| POST | `/driver/deliveries/:id/complete` | `{ otp: "123456", photoKey }` | `DeliveryJob` |
| POST | `/driver/deliveries/:id/fail` | `{ reason, note?, photoKey }` | `DeliveryJob` |

`:id` is the **assignment id**. `reason` is one of `customer_unavailable`, `site_inaccessible`,
`customer_refused`, `goods_damaged`, `other`. Wrong OTP returns 400; the 5th wrong try returns 403
("locked, contact ops").

**Re-attempt.** After `fail` the group is `delivery_failed`. Ops starts a re-attempt in the admin panel (same or another driver). The new job appears in `GET /driver/deliveries` **already `picked_up`** with `attemptNo` 2 and a fresh customer code, because the goods stay on the truck: there is no second pickup step. The driver app has no push yet, so it must refresh the list to see it.

Write calls (`pickup`, `complete`, `fail`) on a `blocked` job (order refunded or cancelled) return 400; show STOP.

```ts
DeliveryJob {
  id: string;                       // assignment id
  status: 'assigned'|'picked_up'|'delivered'|'failed'|'cancelled';
  attemptNo: number;
  blocked: boolean;                 // true => show STOP (order refunded/cancelled); actions return 400
  blockedReason: string | null;
  orderId: string; groupId: string;
  pickup: { vendorName: string; address: string; lat: number|null; lng: number|null; phone: string };
  drop:   { recipientName: string; phone: string; addressLine1: string; addressLine2: string|null;
            city: string; pincode: string; lat: number|null; lng: number|null };
  items:  { orderItemId: string; name: string; quantity: number; unit: string }[];
  vendorHandedOverAt: string | null;
  pickedUpAt: string | null; deliveredAt: string | null; failedAt: string | null;
  failureReason: string | null;
}
DriverProfile {
  id: string; name: string; phone: string;
  helper: { name: string; phone: string } | null;
  vehicle: { registrationNumber: string; type: string } | null;
}
```

## 2. Vendor app additions

| Method | Path | Body | Notes |
|---|---|---|---|
| PATCH | `/vendors/order-groups/:id/status` | `{ status: "ready_for_pickup" }` | Existing endpoint. `shipped` and `delivered` are now rejected for vendors. |
| POST | `/vendors/order-groups/:id/photo-url` | `{ contentType }` | Presigned upload for the optional handover photo. |
| POST | `/vendors/order-groups/:id/handover` | `{ photoKey? }` | Needs a driver assigned (400 otherwise). Idempotent: a repeat keeps the first timestamp. Returns `{ groupId, vendorHandedOverAt }`. The group status does not change; the driver confirms pickup. |

## 3. Customer app additions

`GET /orders/:id` vendor groups gain:
- new `status` values `ready_for_pickup` and `delivery_failed`;
- `deliveryOtp: string | null`, set only while the group is `shipped`. Show it on the tracking screen
  ("Tell the driver this code on delivery"). SMS is not live, so the app is the only place the customer sees it.

Status labels suggested: `confirmed` Order confirmed, `ready_for_pickup` Packed, `shipped` Out for delivery,
`delivered` Delivered, `delivery_failed` Delivery attempt failed (we will contact you).

## 4. Not in the MVP

Push notifications (driver app must pull or refresh), live location, route order, helper login.
