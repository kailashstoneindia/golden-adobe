-- Weekly payments reconciliation export (decision 0054).
--
-- One row per order that has a razorpay_payment_id and either was created in
-- [from, to) or has a refund whose updated_at falls in [from, to), so a refund
-- that settles or fails late shows up in the week it changed.
-- Paste Razorpay's settlement report next to the output and fill the four empty
-- columns (fee_paise, settlement_amount_paise, settlement_date, settlement_utr).
--
-- Run (plain values; the file quotes them itself with :'from' / :'to'):
--   psql "$DATABASE_URL" -v from=2026-10-26 -v to=2026-11-02 \
--     -f apps/backend/scripts/payments-recon-export.sql
--   docker exec -i golden-abode-postgres psql -U postgres -d golden_abode_test \
--     -v from=2026-10-26 -v to=2026-11-02 < apps/backend/scripts/payments-recon-export.sql
-- For a CSV, add --csv to psql (or \copy the result).
-- The date bounds are cast in the session timezone; for IST days use
-- (:'from' || ' 00:00 Asia/Kolkata')::timestamptz in the WHERE clause below.
--
-- captured_paise is what Razorpay actually captured (orders.captured_paise),
-- falling back to grand_total when it is NULL. difference_paise is
-- captured - refunded_processed; a nonzero value must be explained by the fee,
-- the settlement, or an open refund, otherwise investigate it.
--
-- refunds_failed_paise is the sum of refunds the sync marked `failed`. A nonzero
-- failed amount with no later processed refund = a promised refund that did not
-- happen; investigate.

SELECT
  o.id                                                   AS order_id,
  o.razorpay_order_id,
  o.razorpay_payment_id,
  o.status                                               AS order_status,
  COALESCE(o.captured_paise, round(o.grand_total * 100))::bigint
                                                         AS captured_paise,
  COALESCE(r.processed_paise, 0)::bigint                 AS refunded_processed_paise,
  COALESCE(r.open_paise, 0)::bigint                      AS refunds_open_paise,
  COALESCE(r.failed_paise, 0)::bigint                    AS refunds_failed_paise,
  NULL::bigint                                           AS fee_paise,
  NULL::bigint                                           AS settlement_amount_paise,
  NULL::date                                             AS settlement_date,
  NULL::text                                             AS settlement_utr,
  (COALESCE(o.captured_paise, round(o.grand_total * 100))
     - COALESCE(r.processed_paise, 0))::bigint           AS difference_paise,
  o.created_at
FROM orders o
LEFT JOIN LATERAL (
  SELECT
    SUM(amount_paise) FILTER (WHERE status = 'processed')                AS processed_paise,
    SUM(amount_paise) FILTER (WHERE status IN ('requested', 'submitted')) AS open_paise,
    SUM(amount_paise) FILTER (WHERE status = 'failed')                   AS failed_paise
  FROM refunds
  WHERE order_id = o.id
) r ON true
WHERE o.razorpay_payment_id IS NOT NULL
  AND (
    (o.created_at >= :'from'::timestamptz AND o.created_at < :'to'::timestamptz)
    OR EXISTS (
      SELECT 1
      FROM refunds rf
      WHERE rf.order_id = o.id
        AND rf.updated_at >= :'from'::timestamptz
        AND rf.updated_at <  :'to'::timestamptz
    )
  )
ORDER BY o.created_at;
