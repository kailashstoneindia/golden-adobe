'use strict';

// Decision 0048 — distinguishing "never reviewed" from "admin rejected".
// User.isApproved (unchanged, stays the authorization gate every guard
// checks) cannot tell the two apart: both read isApproved = false. This
// column is the richer, vendor-facing record of *how* that boolean got
// set — written alongside it by VendorsService.approveVendor/rejectVendor,
// not a replacement for it.
//
// rejection_reason/status_updated_at close a second gap: today a reject
// reason is logged (AdminService.rejectUser) and then gone forever, never
// shown again to anyone.
//
// Backfill: every existing vendor is either currently approved (their
// user row has is_approved = true) or has simply never been reviewed —
// there is no way, before this migration, for any existing row to mean
// "rejected", so nothing backfills into REJECTED.
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.sequelize.query(`
      CREATE TYPE vendor_status AS ENUM ('PENDING', 'APPROVED', 'REJECTED');
    `);

    await queryInterface.addColumn('vendors', 'status', {
      type: 'vendor_status',
      allowNull: false,
      defaultValue: 'PENDING',
    });

    await queryInterface.addColumn('vendors', 'rejection_reason', {
      type: Sequelize.TEXT,
      allowNull: true,
    });

    await queryInterface.addColumn('vendors', 'status_updated_at', {
      type: Sequelize.DATE,
      allowNull: true,
    });

    await queryInterface.sequelize.query(`
      UPDATE vendors v
      SET status = 'APPROVED', status_updated_at = now()
      FROM users u
      WHERE v.user_id = u.id AND u.is_approved = true;
    `);
  },

  down: async (queryInterface) => {
    await queryInterface.removeColumn('vendors', 'status_updated_at');
    await queryInterface.removeColumn('vendors', 'rejection_reason');
    await queryInterface.removeColumn('vendors', 'status');
    await queryInterface.sequelize.query(`DROP TYPE IF EXISTS vendor_status;`);
  },
};
