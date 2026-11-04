'use strict';

// Fixes "no customer profile found for this user" on cart / checkout / orders.
//
// 20261008090000-create-customers.js created the customers table but did not
// backfill it, and AuthService.register only creates a customers row for users
// registering AFTER that point. Every CUSTOMER account registered before then
// has a login and no shopping profile, so every call that goes through
// CustomersService.resolveCustomerByUserId 404s for it.
//
// This inserts the missing row for each such user. Safe to re-run: it only
// touches CUSTOMER users that have no customers row, so accounts that already
// have one are left exactly as they are.
//
// full_name is NOT NULL on customers but users.name is nullable, so a missing
// or blank name falls back to 'Customer' (the person can rename themselves via
// the profile screen).
//
// down is deliberately a no-op: a backfilled row is indistinguishable from one
// created at registration, and deleting profiles on rollback would orphan any
// carts and addresses that have since been attached to them.
module.exports = {
  up: async (queryInterface) => {
    await queryInterface.sequelize.query(`
      INSERT INTO customers (id, user_id, full_name, created_at, updated_at)
      SELECT gen_random_uuid(),
             u.id,
             COALESCE(NULLIF(BTRIM(u.name), ''), 'Customer'),
             now(),
             now()
      FROM users u
      LEFT JOIN customers c ON c.user_id = u.id
      WHERE u.role = 'CUSTOMER'
        AND c.id IS NULL
    `);
  },

  down: async () => {},
};
