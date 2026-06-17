# Artisan — Golden Abode

## 1. Definition

An **Artisan** (also referred to as "Ustaad" in the product vision) is a verified tradesperson — a carpenter, plumber, painter, electrician, mason, tile layer, or similar skilled professional — who operates on the Golden Abode platform in two capacities:

1. **Service Provider**: They are hired directly by customers to perform work at the customer's home or project site.
2. **Trusted Advisor**: After assessing the site, they recommend specific materials and products available on the platform for the customer to order.

Artisans are **not vendors**. They do not sell products. They provide labour and expertise, and they earn **reward points** (not direct commission) when a customer orders products they have recommended.

> **Future Consideration**: In later phases, artisans may be managed by a **contractor** who coordinates a team. In MVP, all artisans operate independently and are hired directly by customers.

---

## 2. The Two Customer Journeys

The artisan is the differentiating factor between two distinct ordering paths on the platform.

### Path A — Direct Order (No Artisan)
The customer knows what they need. They browse the product catalog, select items, and place an order directly from a vendor. No artisan is involved.

```
Customer
  └── Browse Catalog
        └── Add to Cart
              └── Checkout
                    └── Order → Fulfilled by Vendor
```

### Path B — Artisan-Assisted Order
The customer does not know exactly what to buy or how much. They hire an artisan to visit their site. The artisan assesses the project and recommends specific products from the platform. The customer then orders those products.

```
Customer
  └── Browse Artisans (filter by trade type)
        └── Hire Artisan (Service Booking created)
              └── Artisan visits site
                    └── Artisan recommends products (in-app)
                          └── Customer reviews recommendations
                                └── Customer orders
                                      └── Order → Fulfilled by Vendor
                                      └── Artisan earns Reward Points
```

**The single key difference at the database level**: orders in Path B carry a `booking_id` linking them to a service booking (and thus to the artisan). Orders in Path A have `booking_id = NULL`.

---

## 3. Artisan Onboarding Flow

Artisan onboarding is a **two-step process** unlike customers, who can start ordering immediately after registration.

### Step 1: Registration (Phase 1 — Auth Flow)
The artisan goes through the same OTP login as everyone else and selects the role `ARTISAN` on the registration form. Their base user row and artisan profile row are created. `is_verified = false`.

```
POST /auth/otp/send   { phone }
POST /auth/otp/verify { phone, otp }
POST /auth/register   { onboardingToken, name, role: "ARTISAN" }

→ users row created        (id, name, phone, role = ARTISAN)
→ artisans row created     (user_id FK, is_verified = false)
```

The artisan can log in and browse the app but **cannot appear in customer search results and cannot earn rewards** until verified.

### Step 2: Profile Completion (Phase 2 — Artisan Onboarding Module)
After registration, the artisan lands on a guided "Complete Your Profile" checklist:

| Step | Field | Required |
|------|-------|----------|
| 1 | Trade type selection | ✅ Required |
| 2 | Service pincode / area | ✅ Required |
| 3 | Years of experience | Optional |
| 4 | Short bio | Optional |
| 5 | Profile photo upload | Optional (encouraged) |
| 6 | Verification document upload | ✅ Required for verification |

Document types accepted: Aadhaar Card, Trade License, Contractor License (to be confirmed with client).

### Step 3: Admin Verification
An admin reviews the artisan's profile and document in the admin panel. On approval, `is_verified` is set to `true`. The artisan immediately becomes discoverable in customer search.

```
Admin Panel
  └── Pending Verification Queue
        └── Review artisan profile + document
              └── Approve → is_verified = true → Artisan visible in search
              └── Reject  → is_verified = false → Notification sent to artisan
```

---

## 4. Database Schema

### Phase 1 Table (`artisans`)
The minimal foundational table. Only columns we know for certain are included. All speculative or parking-lot-dependent columns are deferred.

```sql
CREATE TABLE artisans (
  id               VARCHAR(36)  PRIMARY KEY,
  user_id          VARCHAR(36)  UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  trade_type       ENUM(
                     'CARPENTER',
                     'PLUMBER',
                     'PAINTER',
                     'ELECTRICIAN',
                     'MASON',
                     'TILE_LAYING',
                     'OTHERS'
                   ) NOT NULL,

  experience_years INT,                        -- Self-reported, displayed on profile card
  bio              TEXT,                        -- Short self-description for profile
  service_pincode  VARCHAR(10),                -- Primary service area (Phase 2: upgrade to lat/lng)
  document_url     TEXT,                        -- S3/CDN URL of uploaded verification document

  is_verified      BOOLEAN      NOT NULL DEFAULT FALSE,  -- Admin approval gate
  is_available     BOOLEAN      NOT NULL DEFAULT TRUE,   -- Artisan toggles on/off (like Uber Driver status)

  created_at       TIMESTAMP    NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMP    NOT NULL DEFAULT NOW()
);
```

**Deferred columns (not in Phase 1):**
- `reward_points_balance` — Phase 2, computed from `artisan_rewards_ledger`
- `lifetime_points_earned` — Phase 2
- `contractor_id` — Phase 3, for team hierarchy
- `latitude`, `longitude` — Phase 2, upgrade from pincode for geofencing

---

### Phase 2 Tables (Future — Do Not Create Now)

These tables will reference `artisans.id`. The `artisans` table itself needs no changes to support them.

#### `service_bookings`
Created when a customer hires an artisan.

```sql
CREATE TABLE service_bookings (
  id            VARCHAR(36)   PRIMARY KEY,
  customer_id   VARCHAR(36)   NOT NULL REFERENCES customers(id),
  artisan_id    VARCHAR(36)   NOT NULL REFERENCES artisans(id),
  status        ENUM(
                  'REQUESTED',
                  'ACCEPTED',
                  'IN_PROGRESS',
                  'COMPLETED',
                  'CANCELLED'
                ) NOT NULL DEFAULT 'REQUESTED',
  scheduled_at  TIMESTAMP,                     -- When artisan is expected to visit
  address_text  TEXT          NOT NULL,         -- Customer's site address
  notes         TEXT,                           -- Customer's job description
  created_at    TIMESTAMP     NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMP     NOT NULL DEFAULT NOW()
);
```

#### `artisan_recommendations`
Products recommended by the artisan during or after a site visit.

```sql
CREATE TABLE artisan_recommendations (
  id             VARCHAR(36) PRIMARY KEY,
  booking_id     VARCHAR(36) NOT NULL REFERENCES service_bookings(id),
  product_id     VARCHAR(36) NOT NULL REFERENCES products(id),
  suggested_qty  INT         NOT NULL DEFAULT 1,
  notes          TEXT,                           -- Artisan's note about this product
  created_at     TIMESTAMP   NOT NULL DEFAULT NOW()
);
```

#### `orders` (relevant columns only)
An order connects back to a booking for artisan attribution.

```sql
-- Relevant columns on the orders table
booking_id  VARCHAR(36) REFERENCES service_bookings(id)  -- NULL = Path A (direct order)
                                                          -- SET  = Path B (artisan-assisted)
```

#### `artisan_rewards_ledger`
Immutable audit log of every point credit and withdrawal.

```sql
CREATE TABLE artisan_rewards_ledger (
  id                  VARCHAR(36) PRIMARY KEY,
  artisan_id          VARCHAR(36) NOT NULL REFERENCES artisans(id) ON DELETE CASCADE,
  order_id            VARCHAR(36) REFERENCES orders(id),  -- NULL for manual credits or withdrawals
  transaction_type    ENUM('CREDIT', 'DEBIT_WITHDRAWAL') NOT NULL,
  points              INT         NOT NULL,                -- Always a positive integer
  description         VARCHAR(255),
  created_at          TIMESTAMP   NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ledger_artisan ON artisan_rewards_ledger(artisan_id);
```

---

## 5. Full Relationship Map

```
users
  └── artisans (1:1)                               ← Phase 1
        └── service_bookings (1:N)                 ← Phase 2
              └── artisan_recommendations (1:N)    ← Phase 2
              └── orders (1:N via booking_id)       ← Phase 2
                    └── artisan_rewards_ledger      ← Phase 2
```

The `artisans` table is the permanent anchor. All future connections are outward — other tables reference `artisans.id`. No structural changes to the `artisans` table are needed to support the full Phase 2 flow.

---

## 6. Artisan Availability & Discovery (Phase 2)

Customers will search for artisans using filters:
- **Trade type** (Plumber, Electrician, etc.)
- **Location / Pincode** (Phase 2: proximity-based, Phase 3: map view)
- **Availability status** (`is_available = true`)
- **Verification status** (`is_verified = true` — customers only see verified artisans)

The artisan profile card displayed to customers will show:
- Name, photo, trade type
- Experience years, bio
- Rating (Phase 2 — after review system is built)
- Availability badge (Available / Busy)

---

## 7. Reward Points Logic

> Full rules to be confirmed with client. The following is the proposed model.

| Event | Points Action |
|-------|--------------|
| Customer places an order linked to artisan booking | CREDIT points to artisan |
| Artisan requests cash withdrawal | DEBIT from ledger |
| Admin manually adjusts balance | CREDIT or DEBIT (admin tool) |

**Point calculation rule** (proposed — needs client confirmation):
- Either a **fixed points per order** (e.g. 100 points per order regardless of value)
- Or a **percentage of order value** (e.g. 2% of order GMV converted to points)

**Attribution rule**: Points are only credited when the order status reaches `DELIVERED` — not on placement. This prevents gaming via cancelled orders.

---

## 8. Open Questions (Parking Lot)

These require client decisions before Phase 2 development begins.

| # | Question | Impact |
|---|----------|--------|
| P1 | Points calculation method: fixed vs. percentage of GMV? | Rewards ledger schema and point credit logic |
| P2 | Do points expire? If yes, after how long? | Adds `expires_at` to ledger, background job needed |
| P3 | Minimum balance for cash withdrawal? | Business rule enforced at API level |
| P4 | What verification documents are accepted? | Document upload spec and admin review workflow |
| P5 | Is the artisan site visit paid? Does the customer pay a visit fee? | If yes, adds a `visit_fee` and payment to service_bookings |
| P6 | Can an artisan service multiple pincodes? | Single `service_pincode` vs. a `artisan_service_areas` table |
| P7 | Contractor / team hierarchy — which phase? | Phase 3 or Phase 4? Adds `contractor_id FK` to artisans |
| P8 | In-app scheduling or off-platform (WhatsApp)? | Determines if `scheduled_at` on service_bookings is used or ignored |

---

## 9. Phase Delivery Summary

| Feature | Phase |
|---------|-------|
| Artisan registration & OTP login | Phase 1 |
| `artisans` base table migration | Phase 1 |
| Profile completion checklist (in-app) | Phase 2 |
| Document upload & admin verification flow | Phase 2 |
| Artisan search & discovery | Phase 2 |
| Service bookings (hire flow) | Phase 2 |
| Artisan product recommendations | Phase 2 |
| Order-to-artisan attribution | Phase 2 |
| Rewards ledger & points credit | Phase 2 |
| Artisan wallet & cash withdrawal | Phase 3 |
| Ratings & reviews for artisans | Phase 3 |
| Contractor / team hierarchy | Phase 3+ |
| Map-based artisan search | Phase 3+ |
