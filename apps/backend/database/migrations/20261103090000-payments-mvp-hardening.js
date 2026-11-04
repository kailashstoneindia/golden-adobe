'use strict';

// Decision 0054. Moves the payment-safety rules out of application code and
// into the schema: Razorpay ids are unique per order, order status is a closed
// set, webhook deliveries are de-duplicated by Razorpay's event id, and every
// refund is a durable row (refunds) that can be retried without re-issuing.
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.sequelize.transaction(async (t) => {
      const q = (sql) => queryInterface.sequelize.query(sql, { transaction: t });

      // Unique indexes cannot be built over existing duplicates. Fail loudly
      // with the offending ids rather than letting CREATE INDEX report an
      // opaque error (or worse, deleting data to make it pass).
      const [dupOrders] = await q(
        `SELECT razorpay_order_id AS id FROM orders
           WHERE razorpay_order_id IS NOT NULL
           GROUP BY razorpay_order_id HAVING count(*) > 1`,
      );
      const [dupPayments] = await q(
        `SELECT razorpay_payment_id AS id FROM orders
           WHERE razorpay_payment_id IS NOT NULL
           GROUP BY razorpay_payment_id HAVING count(*) > 1`,
      );
      const duplicates = [...dupOrders, ...dupPayments].map((r) => r.id);
      if (duplicates.length > 0) {
        throw new Error(
          `duplicate razorpay ids before 0054 unique indexes: ${duplicates.join(', ')}`,
        );
      }

      await q(
        `CREATE UNIQUE INDEX orders_razorpay_order_id_unique
           ON orders (razorpay_order_id) WHERE razorpay_order_id IS NOT NULL`,
      );
      await q(
        `CREATE UNIQUE INDEX orders_razorpay_payment_id_unique
           ON orders (razorpay_payment_id) WHERE razorpay_payment_id IS NOT NULL`,
      );
      await q(
        `ALTER TABLE orders ADD CONSTRAINT orders_status_check CHECK (status IN
           ('pending_payment', 'confirmed', 'cancelled', 'refund_required', 'refund_pending', 'refunded'))`,
      );

      // Razorpay's x-razorpay-event-id. Nullable because rows written before
      // this migration have none; a plain (non-partial) unique index is enough
      // since Postgres treats NULLs as distinct.
      await q(`ALTER TABLE payment_events ADD COLUMN event_id VARCHAR(64) NULL`);
      await q(`CREATE UNIQUE INDEX payment_events_event_id_unique ON payment_events (event_id)`);

      await queryInterface.createTable(
        'refunds',
        {
          id: {
            type: Sequelize.UUID,
            defaultValue: Sequelize.literal('gen_random_uuid()'),
            primaryKey: true,
          },
          order_id: {
            type: Sequelize.UUID,
            allowNull: false,
            references: { model: 'orders', key: 'id' },
            onUpdate: 'CASCADE',
            onDelete: 'RESTRICT',
          },
          order_vendor_group_id: {
            type: Sequelize.UUID,
            allowNull: true,
            references: { model: 'order_vendor_group', key: 'id' },
            onUpdate: 'CASCADE',
            onDelete: 'RESTRICT',
          },
          rail: { type: Sequelize.STRING(16), allowNull: false },
          razorpay_payment_id: { type: Sequelize.STRING(128), allowNull: true },
          payout_reference: { type: Sequelize.STRING(128), allowNull: true },
          amount_paise: { type: Sequelize.BIGINT, allowNull: false },
          idempotency_key: { type: Sequelize.STRING(64), allowNull: false, unique: true },
          receipt: { type: Sequelize.STRING(40), allowNull: false, unique: true },
          razorpay_refund_id: { type: Sequelize.STRING(128), allowNull: true, unique: true },
          status: { type: Sequelize.STRING(16), allowNull: false },
          reason: { type: Sequelize.TEXT, allowNull: false },
          created_by: {
            type: Sequelize.UUID,
            allowNull: false,
            references: { model: 'users', key: 'id' },
            onUpdate: 'CASCADE',
            onDelete: 'RESTRICT',
          },
          created_at: {
            type: Sequelize.DATE,
            allowNull: false,
            defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
          },
          updated_at: {
            type: Sequelize.DATE,
            allowNull: false,
            defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
          },
        },
        { transaction: t },
      );

      await q(
        `ALTER TABLE refunds
           ADD CONSTRAINT refunds_rail_check CHECK (rail IN ('razorpay', 'manual_payout')),
           ADD CONSTRAINT refunds_status_check
             CHECK (status IN ('requested', 'submitted', 'processed', 'failed')),
           ADD CONSTRAINT refunds_amount_paise_check CHECK (amount_paise > 0),
           ADD CONSTRAINT refunds_razorpay_payment_check
             CHECK (rail <> 'razorpay' OR razorpay_payment_id IS NOT NULL)`,
      );
      await q(`CREATE INDEX idx_refunds_order_id ON refunds (order_id)`);
      // The refund sync job only ever scans unfinished rows.
      await q(
        `CREATE INDEX idx_refunds_open_status ON refunds (status)
           WHERE status IN ('requested', 'submitted')`,
      );
    });
  },

  down: async (queryInterface) => {
    await queryInterface.sequelize.transaction(async (t) => {
      const q = (sql) => queryInterface.sequelize.query(sql, { transaction: t });
      await queryInterface.dropTable('refunds', { transaction: t });
      await q(`DROP INDEX IF EXISTS payment_events_event_id_unique`);
      await q(`ALTER TABLE payment_events DROP COLUMN IF EXISTS event_id`);
      await q(`ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_status_check`);
      await q(`DROP INDEX IF EXISTS orders_razorpay_payment_id_unique`);
      await q(`DROP INDEX IF EXISTS orders_razorpay_order_id_unique`);
    });
  },
};
