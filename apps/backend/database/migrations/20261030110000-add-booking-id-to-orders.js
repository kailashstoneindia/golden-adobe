'use strict';

// Decision 0045, Batch 2: attribution from an order back to the artisan
// hire request (the "booking") it came from. NULL = Path A, a direct
// order with no artisan involved (docs/artisan.md §4's existing framing).
// SET = Path B, a checkout initiated against an active or completed
// engagement. There is no separate service_bookings table in this schema
// (docs/artisan.md's Phase 2 table was never built) — the hire request
// itself is the booking, so this references artisan_hire_requests
// directly.
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('orders', 'booking_id', {
      type: Sequelize.UUID,
      allowNull: true,
      references: { model: 'artisan_hire_requests', key: 'id' },
      onUpdate: 'CASCADE',
      // A hire request being deleted should not take its past orders down
      // with it — matches orders.customer_id's own onDelete: RESTRICT
      // reasoning (an order is a durable record), but SET NULL here
      // rather than RESTRICT since hire requests are a much newer, less
      // load-bearing entity and a deleted one should not block on its
      // historical orders existing.
      onDelete: 'SET NULL',
    });
    await queryInterface.addIndex('orders', ['booking_id'], {
      name: 'idx_orders_booking_id',
    });
  },

  down: async (queryInterface) => {
    await queryInterface.removeIndex('orders', 'idx_orders_booking_id');
    await queryInterface.removeColumn('orders', 'booking_id');
  },
};
