# 0057 — OTP send limit applies only when real SMS is on

- **Date:** 2026-11-04
- **Status:** Implemented (pending merge)
- **Supersedes / Superseded by:** —

## Context

`AuthService.sendOtp` allows 3 OTP sends per phone number per hour
(`THROTTLE_OTP_SEND_LIMIT` / `THROTTLE_OTP_SEND_TTL`, counter in Redis under `otp_rate:<phone>`).
During manual testing on AWS the limit locked the tester out of their own customer account for
about an hour: the counter is per phone number, so every login attempt by anyone, including the
account's owner on their phone, counts against it.

The limit exists to stop two abuses: spamming a victim's number with SMS, and running up MSG91
cost. Both need real SMS. In demo mode (`USE_MSG91_SMS=false`, today's AWS state) no SMS is sent or
billed, and the API returns the code in the response (`devOtp`), so the send limit protects
nothing and only gets in the way. The separate verify-attempt limit (5 per 10 minutes,
`verifyOtp`) guards against code guessing and is a different concern.

## Options considered

### Option A — Enforce the send limit only when `USE_MSG91_SMS=true` (chosen)

- **Pro:** testing is unrestricted now; the protection returns automatically at go-live with no
  config to remember. No counter is written in demo mode, so every number starts clean when real
  SMS is switched on.
- **Con:** a small code branch in `sendOtp`; demo and real mode now differ in one more way.

### Option B — Raise `THROTTLE_OTP_SEND_LIMIT` in production config

- **Pro:** no code change.
- **Con:** edits prod config and needs a restart; the inflated value has to be remembered and
  lowered before launch, and forgetting it would ship a production SMS endpoint with no practical
  limit.

### Option C — Remove the send limit entirely

- **Pro:** simplest.
- **Con:** opens SMS-spam and cost abuse the day real SMS is enabled.

## Decision

**Option A.** In `sendOtp`, the send-limit check and the counter write run only when
`useMsg91Sms` is true. The verify-attempt limit is unchanged.

## Consequences

- Demo mode has no send limit. That is acceptable only because demo mode is not a protection
  boundary at all: the code is fixed (`123456`) and returned in the response, so anyone can already
  log in as any non-admin account. That hole is the real go-live blocker and is closed by switching
  to MSG91, not by this limit.
- On the day `USE_MSG91_SMS=true` is set, the 3-per-hour limit applies from a clean counter.
- Existing `otp_rate:*` keys in Redis expire on their own (TTL 3600s); no cleanup needed.
- New spec `auth.service.send-otp.spec.ts` covers: demo mode never blocks and writes no counter;
  real-SMS mode still blocks the 4th send.
