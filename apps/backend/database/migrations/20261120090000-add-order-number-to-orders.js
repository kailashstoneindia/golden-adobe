'use strict';

// Decision 0061: a short number people can read out loud (GA-10001) next to
// the UUID. The database assigns it from a sequence, so every code path that
// creates an order gets one and two orders can never share a number.
module.exports = {
  up: async (queryInterface) => {
    await queryInterface.sequelize.transaction(async (transaction) => {
      const run = (sql) => queryInterface.sequelize.query(sql, { transaction });

      await run('CREATE SEQUENCE IF NOT EXISTS order_number_seq START WITH 10001');
      await run('ALTER TABLE orders ADD COLUMN order_number VARCHAR(20)');
      // Existing orders are numbered oldest first, so the numbers follow the history.
      await run(`
        UPDATE orders o
           SET order_number = 'GA-' || n.num
          FROM (
            SELECT id, nextval('order_number_seq') AS num
              FROM (SELECT id FROM orders ORDER BY created_at, id) ordered
          ) n
         WHERE o.id = n.id
      `);
      await run(
        `ALTER TABLE orders ALTER COLUMN order_number SET DEFAULT ('GA-' || nextval('order_number_seq'))`,
      );
      await run('ALTER TABLE orders ALTER COLUMN order_number SET NOT NULL');
      await run('ALTER TABLE orders ADD CONSTRAINT orders_order_number_key UNIQUE (order_number)');
    });
  },

  down: async (queryInterface) => {
    await queryInterface.sequelize.transaction(async (transaction) => {
      const run = (sql) => queryInterface.sequelize.query(sql, { transaction });
      await run('ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_order_number_key');
      await run('ALTER TABLE orders DROP COLUMN IF EXISTS order_number');
      await run('DROP SEQUENCE IF EXISTS order_number_seq');
    });
  },
};
