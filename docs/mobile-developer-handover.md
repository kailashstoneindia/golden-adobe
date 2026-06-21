# Backend Handoff for Mobile App Developer

Welcome! The backend infrastructure and Phase 1 Authentication system for **Golden Abode** is now 100% complete and ready for you to build against.

This document covers everything you need to start building the mobile app.

---

## 1. Local Setup

To run the full backend locally so you can test your app:

1.  Make sure you have **Node 20+**, **pnpm 9+**, and **Docker** installed.
2.  In the root of the repository, install everything:
    ```bash
    pnpm install
    ```
3.  Start the Postgres database and Redis cache:
    ```bash
    docker-compose up -d
    ```
4.  Run the database migrations to create the tables:
    ```bash
    pnpm --filter @golden-abode/backend run migration:run
    ```
5.  Start the backend API in watch mode:
    ```bash
    pnpm dev
    ```
    The API will now be running at `http://localhost:3000`.

---

## 2. Shared Types (No More Guessing!)

Because this is a Turborepo Monorepo, you **do not need to recreate TypeScript interfaces** for API responses.

You can simply import types directly into the `apps/mobile` app from the shared `@golden-abode/types` package. 
Example:
```typescript
import { User, Role, AuthTokens } from '@golden-abode/types';

const user: User = response.data.user;
```

---

## 3. Interactive API Documentation

You do not need to guess what headers, body parameters, or URLs to use.
Once the backend is running (`pnpm dev`), go to your browser and open:

👉 **[http://localhost:3000/api/docs](http://localhost:3000/api/docs)**

This is our live Swagger OpenAPI portal. You can literally click "Try it out" on any endpoint to see exactly how it behaves and what JSON it returns.

---

## 4. Building the Authentication UI (Current Focus)

The entire JWT + OTP flow is finished. You can build the login screens immediately. Here is how the flow works:

### Step 1: Send OTP
*   **Endpoint**: `POST /api/auth/otp/send`
*   **Body**: `{ "phone": "+919876543210" }`
*   **⚠️ DEVELOPMENT HACK**: To make testing easy, if the backend is running locally (`NODE_ENV=development`), the OTP is always hardcoded to `123456`. You don't have to check terminal logs! The API will actually return the OTP in the JSON response (`devOtp: '123456'`) so you can even auto-fill it in your debug builds.

### Step 2: Verify OTP
*   **Endpoint**: `POST /api/auth/otp/verify`
*   **Body**: `{ "phone": "+919876543210", "otp": "123456" }`
*   **Logic**: 
    *   If it returns `isNewUser: false`, the user already exists. It will return `accessToken` and `refreshToken`. **Save these in secure storage.**
    *   If it returns `isNewUser: true`, it will return an `onboardingToken`. Hold onto this in memory and take the user to the Registration Screen.

### Step 3: Register (Only for New Users)
*   **Endpoint**: `POST /api/auth/register`
*   **Body**: `{ "onboardingToken": "...", "name": "Rajesh", "role": "CUSTOMER" }` (Role can be `CUSTOMER`, `ARTISAN`, or `VENDOR`)
*   **Result**: It returns the `accessToken` and `refreshToken`. Save them.

### Step 4: Using the Tokens
*   Attach the `accessToken` to all future API calls as a header: `Authorization: Bearer <accessToken>`.
*   Access tokens expire in 15 minutes. Use the `POST /api/auth/refresh` endpoint to silently swap the `refreshToken` for a new pair of tokens when you get a `401 Unauthorized`.

---

Happy building! Let us know if you run into any issues.
