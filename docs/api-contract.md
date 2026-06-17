# Golden Abode — Backend API Contract
### For Mobile (Co-developer) & Admin Panel Integration

> **Version**: Phase 1
> **Base URL (Dev)**: `http://localhost:3000`
> **Base URL (Staging)**: TBD
> **Last Updated**: June 2026

---

## 1. General Conventions

### 1.1 Field Naming
All JSON request and response bodies use **camelCase**.

```json
{ "accessToken": "...", "isNewUser": true, "createdAt": "..." }
```

### 1.2 Date & Time Format
All timestamps are **ISO 8601 UTC strings**.

```json
"createdAt": "2026-06-16T14:30:00.000Z"
```

Never assume local time. The mobile app should convert to the user's local timezone for display.

### 1.3 Phone Number Format
All phone numbers use **E.164 format**.

```
+919876543210    ✅ Correct
9876543210       ❌ Wrong
09876543210      ❌ Wrong
```

### 1.4 IDs
All entity IDs are **UUID strings** (36 characters).

```json
"id": "550e8400-e29b-41d4-a716-446655440000"
```

### 1.5 Boolean Fields
Use standard JSON `true` / `false`. Never use `0`, `1`, `"yes"`, or `"no"`.

### 1.6 Null vs Omitted
If a field exists in the schema but has no value, it is returned as `null` — it is **not omitted** from the response. This prevents frontend crashes from accessing undefined properties.

```json
{ "gstin": null, "deviceToken": null }   ✅
{ }                                        ❌ (field just missing)
```

---

## 2. Standard Response Envelope

### 2.1 Success Response
Every successful response wraps its data in a consistent envelope:

```json
{
  "success": true,
  "data": { ... },
  "message": "Human-readable description"   // Optional on success
}
```

**Example — Login success:**
```json
{
  "success": true,
  "data": {
    "accessToken": "eyJhbGciOiJIUzI1NiJ9...",
    "refreshToken": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
    "isNewUser": false,
    "user": {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "name": "Ramesh Kumar",
      "phone": "+919876543210",
      "role": "VENDOR",
      "isActive": true,
      "createdAt": "2026-05-01T10:00:00.000Z",
      "updatedAt": "2026-06-16T04:30:00.000Z"
    }
  }
}
```

### 2.2 Error Response
All errors follow this shape — no exceptions:

```json
{
  "success": false,
  "statusCode": 400,
  "error": "Bad Request",
  "message": "Human-readable description of what went wrong",
  "timestamp": "2026-06-16T14:30:00.000Z",
  "path": "/auth/otp/verify"
}
```

**The `message` field is safe to display to users** — it is written in plain English. The app does not need to map error codes to UI strings; just render `message`.

### 2.3 Paginated List Response
For any endpoint that returns a list of items (used in Phase 2+):

```json
{
  "success": true,
  "data": {
    "items": [ ... ],
    "meta": {
      "totalItems": 120,
      "itemsPerPage": 20,
      "currentPage": 1,
      "totalPages": 6
    }
  }
}
```

Pagination is **page-based** (not cursor-based) for Phase 1/2. Query params: `?page=1&limit=20`.

---

## 3. HTTP Status Codes Used

| Code | Meaning | When Used |
|------|---------|-----------|
| `200 OK` | Success | GET requests, successful actions (login, refresh) |
| `201 Created` | Resource created | New user registered, new order placed |
| `400 Bad Request` | Invalid input | Validation errors, malformed payload |
| `401 Unauthorized` | Auth failed | Bad/expired token, wrong OTP |
| `403 Forbidden` | Authenticated but not allowed | Wrong role for endpoint |
| `404 Not Found` | Resource not found | User/order/product doesn't exist |
| `409 Conflict` | Duplicate resource | Phone already registered |
| `422 Unprocessable Entity` | Business rule violation | Onboarding already complete, etc. |
| `429 Too Many Requests` | Rate limited | OTP spam, brute force attempt |
| `500 Internal Server Error` | Server bug | Should never happen in production |

---

## 4. Authentication

### 4.1 Access Token
A **short-lived JWT** (valid for **15 minutes**). Must be sent in the `Authorization` header for all protected endpoints.

```
Authorization: Bearer eyJhbGciOiJIUzI1NiJ9...
```

### 4.2 Refresh Token
An **opaque UUID string** (valid for **30 days**). Used only to call `POST /auth/refresh` to get a new access token. Store this securely on the device (e.g. in the secure keychain / encrypted storage, not AsyncStorage).

### 4.3 Token Handling Rules for Mobile

| Rule | Detail |
|------|--------|
| Access token expiry | 15 minutes. Refresh proactively before it expires (e.g. if less than 2 minutes left). |
| Refresh flow | On any `401` response, try `POST /auth/refresh` once with the stored refresh token. If that also returns `401`, force the user to log in again. |
| Token reuse protection | If a refresh token is used twice, the entire session family is revoked. The user will be logged out on all devices. |
| Logout | Always call `POST /auth/logout` before clearing local tokens — this revokes the refresh token on the server. |

### 4.4 JWT Decoded Payload
```json
{
  "sub": "550e8400-e29b-41d4-a716-446655440000",  // userId
  "role": "VENDOR",
  "iat": 1750050000,
  "exp": 1750050900
}
```

The `role` field in the JWT can be used on the frontend to conditionally render role-specific UI. Do not rely solely on this for access control — the backend always validates role on protected endpoints.

---

## 5. Phase 1 API Endpoints

### `POST /auth/otp/send`
Send an OTP to the given phone number. Works for both new and existing users.

**Request**
```json
{
  "phone": "+919876543210"
}
```

**Response `200 OK`**
```json
{
  "success": true,
  "data": null,
  "message": "OTP sent successfully"
}
```

**Errors**
| Code | Message |
|------|---------|
| `400` | `"phone must be a valid E.164 format phone number"` |
| `429` | `"Too many OTP requests. Please try again in 45 minutes."` |

---

### `POST /auth/otp/verify`
Verify the OTP. This is the **identity checkpoint** — it does not create an account.

- **Existing user** → returns full tokens + user profile. Login complete.
- **New user** → returns an `onboardingToken` only. Must call `POST /auth/register` next.

**Request**
```json
{
  "phone": "+919876543210",
  "otp": "482910"
}
```

**Response `200 OK` — Existing user (login complete)**
```json
{
  "success": true,
  "data": {
    "isNewUser": false,
    "accessToken": "eyJhbGciOiJIUzI1NiJ9...",
    "refreshToken": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "user": {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "name": "Ramesh Kumar",
      "phone": "+919876543210",
      "role": "VENDOR",
      "isActive": true,
      "createdAt": "2026-05-01T10:00:00.000Z",
      "updatedAt": "2026-06-16T04:30:00.000Z"
    }
  }
}
```

**Response `200 OK` — New user (must complete registration)**
```json
{
  "success": true,
  "data": {
    "isNewUser": true,
    "onboardingToken": "eyJhbGciOiJIUzI1NiJ9..."
  }
}
```

> **Mobile Note**: Check `isNewUser` first.
> - `false` → store `accessToken` + `refreshToken`, navigate to home.
> - `true` → store `onboardingToken` temporarily, navigate to the registration form.

**Errors**
| Code | Message |
|------|---------|
| `401` | `"Invalid or expired OTP"` |
| `429` | `"Too many failed attempts. Please try again in 8 minutes."` |

---

### `POST /auth/register`
Complete new user registration. Validates the `onboardingToken`, creates the user record with the selected name and role, and returns session tokens.

**Request**
```json
{
  "onboardingToken": "eyJhbGciOiJIUzI1NiJ9...",
  "name": "Ramesh Kumar",
  "role": "VENDOR"
}
```

> `role` must be one of: `"CUSTOMER"` | `"VENDOR"` | `"ARTISAN"`
> `"ADMIN"` cannot be self-selected — assigned only via admin panel.

**Response `201 Created`**
```json
{
  "success": true,
  "data": {
    "accessToken": "eyJhbGciOiJIUzI1NiJ9...",
    "refreshToken": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
    "user": {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "name": "Ramesh Kumar",
      "phone": "+919876543210",
      "role": "VENDOR",
      "isActive": true,
      "createdAt": "2026-06-16T04:30:00.000Z",
      "updatedAt": "2026-06-16T04:30:00.000Z"
    }
  }
}
```

**Errors**
| Code | Message |
|------|---------|
| `400` | `"Invalid or expired onboarding token"` |
| `400` | `"name is required"` |
| `400` | `"role must be one of: CUSTOMER, VENDOR, ARTISAN"` |
| `409` | `"An account with this phone number already exists"` |

---

### `POST /auth/refresh`
Exchange an active refresh token for a new access token + refresh token pair.
The old refresh token is **immediately invalidated** after this call.

**Request**
```json
{
  "refreshToken": "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
}
```

**Response `200 OK`**
```json
{
  "success": true,
  "data": {
    "accessToken": "eyJhbGciOiJIUzI1NiJ9...(new)",
    "refreshToken": "b2c3d4e5-f6a7-8901-bcde-f01234567891"
  }
}
```

**Errors**
| Code | Message |
|------|---------|
| `401` | `"Invalid refresh token"` |
| `401` | `"Session invalidated. Please log in again."` ← reuse detected, all sessions revoked |

---

### `POST /auth/logout`
Revoke the active session. Requires a valid access token in the header.

**Request Headers**
```
Authorization: Bearer eyJhbGciOiJIUzI1NiJ9...
```

**Request Body**
```json
{
  "refreshToken": "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
}
```

**Response `200 OK`**
```json
{
  "success": true,
  "data": null,
  "message": "Logged out successfully"
}
```

---

### `GET /auth/me`
Get the currently authenticated user's profile.

**Request Headers**
```
Authorization: Bearer eyJhbGciOiJIUzI1NiJ9...
```

**Response `200 OK`**
```json
{
  "success": true,
  "data": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "name": "Ramesh Kumar",
    "phone": "+919876543210",
    "role": "VENDOR",
    "deviceToken": null,
    "isActive": true,
    "createdAt": "2026-05-01T10:00:00.000Z",
    "updatedAt": "2026-06-16T04:30:00.000Z"
  }
}
```

**Errors**
| Code | Message |
|------|---------|
| `401` | `"Unauthorized"` |

---

## 6. User Roles & What They Unlock

| Role | Description | Accessible Screens |
|------|-------------|-------------------|
| `CUSTOMER` | Homeowner / buyer | Browse catalog, place orders, hire artisans |
| `VENDOR` | Shop / supplier | Manage products, view orders, manage stock |
| `ARTISAN` | Tradesperson / Ustaad | View bookings, make recommendations, track rewards |
| `ADMIN` | Platform staff | Admin panel only — not accessible via mobile app |

The role is embedded in the JWT. On app load, decode the token and route the user to the correct home screen based on their role.

---

## 7. Health Check

```
GET /health
```

**Response `200 OK`**
```json
{
  "status": "ok",
  "info": {
    "database": { "status": "up" },
    "redis": { "status": "up" }
  }
}
```

Use this endpoint to check if the backend is reachable before showing the app UI.

---

## 8. API Documentation (Interactive)

Full interactive Swagger/OpenAPI documentation is available at:
```
http://localhost:3000/api/docs     (Development)
https://api.goldenabode.in/api/docs  (Staging — TBD)
```

All endpoints, request bodies, and response schemas are browsable and testable there.

---

## 9. Recommended Mobile Token Storage

| Token | Storage | Reason |
|-------|---------|--------|
| `accessToken` | In-memory (app state / Zustand) | Short-lived (15 min). No need to persist to disk. |
| `refreshToken` | Expo SecureStore / Keychain | Long-lived (30 days). Must be encrypted at rest. |
| `onboardingToken` | In-memory only | Temporary. Only used during registration screen. Never persist. |

---

## 10. Versioning

The API is currently **unversioned** (no `/v1/` prefix). If breaking changes are introduced in future phases, a version prefix will be added and the old version will be supported for a deprecation window. Changes will be communicated via the shared Slack/channel.
