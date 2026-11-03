-- Weekly payments reconciliation export (decision 0054).
--
-- One row per order that has a razorpay_payment_id and was created in [from, to).
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

SELECT
  o.id                                                   AS order_id,
  o.razorpay_order_id,
  o.razorpay_payment_id,
  o.status                                               AS order_status,
  COALESCE(o.captured_paise, round(o.grand_total * 100))::bigint
                                                         AS captured_paise,
  COALESCE(r.processed_paise, 0)::bigint                 AS refunded_processed_paise,
  COALESCE(r.open_paise, 0)::bigint                      AS refunds_open_paise,
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
    SUM(amount_paise) FILTER (WHERE status IN ('requested', 'submitted')) AS open_paise
  FROM refunds
  WHERE order_id = o.id
) r ON true
WHERE o.razorpay_payment_id IS NOT NULL
  AND o.created_at >= :'from'::timestamptz
  AND o.created_at <  :'to'::timestamptz
ORDER BY o.created_at;
