'use strict';

// Decision 0060: in-house delivery. Adds the DRIVER role and the vehicles,
// drivers and delivery_assignments tables. The enum value is added outside a
// transaction (autocommit) so later statements can use it.
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.sequelize.query(
      `ALTER TYPE "enum_users_role" ADD VALUE IF NOT EXISTS 'DRIVER'`,
    );

    const id = {
      type: Sequelize.UUID,
      defaultValue: Sequelize.literal('gen_random_uuid()'),
      primaryKey: true,
    };
    const timestamps = {
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
    };

    await queryInterface.createTable('vehicles', {
      id,
      registration_number: { type: Sequelize.STRING(32), allowNull: false, unique: true },
      type: { type: Sequelize.STRING(64), allowNull: false },
      notes: { type: Sequelize.STRING(255), allowNull: true },
      is_active: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
      ...timestamps,
    });

    await queryInterface.createTable('drivers', {
      id,
      user_id: {
        type: Sequelize.UUID,
        allowNull: false,
        unique: true,
        references: { model: 'users', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT',
      },
      licence_number: { type: Sequelize.STRING(32), allowNull: false },
      licence_doc_key: { type: Sequelize.STRING(255), allowNull: true },
      aadhaar_doc_key: { type: Sequelize.STRING(255), allowNull: true },
      helper_name: { type: Sequelize.STRING(128), allowNull: true },
      helper_phone: { type: Sequelize.STRING(16), allowNull: true },
      vehicle_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: 'vehicles', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      ...timestamps,
    });

    await queryInterface.createTable('delivery_assignments', {
      id,
      order_vendor_group_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'order_vendor_group', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      driver_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'drivers', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT',
      },
      status: { type: Sequelize.STRING(16), allowNull: false, defaultValue: 'assigned' },
      attempt_no: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 1 },
      assigned_by: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'users', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT',
      },
      assigned_at: { type: Sequelize.DATE, allowNull: false },
      vendor_handed_over_at: { type: Sequelize.DATE, allowNull: true },
      vendor_handover_photo_key: { type: Sequelize.STRING(255), allowNull: true },
      picked_up_at: { type: Sequelize.DATE, allowNull: true },
      pickup_checklist: { type: Sequelize.JSONB, allowNull: true },
      delivery_otp: { type: Sequelize.STRING(6), allowNull: true },
      otp_attempts: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      delivered_at: { type: Sequelize.DATE, allowNull: true },
      delivery_photo_key: { type: Sequelize.STRING(255), allowNull: true },
      failed_at: { type: Sequelize.DATE, allowNull: true },
      failure_reason: { type: Sequelize.STRING(32), allowNull: true },
      failure_note: { type: Sequelize.STRING(500), allowNull: true },
      failure_photo_key: { type: Sequelize.STRING(255), allowNull: true },
      cancelled_at: { type: Sequelize.DATE, allowNull: true },
      ...timestamps,
    });

    await queryInterface.sequelize.query(
      `ALTER TABLE delivery_assignments ADD CONSTRAINT delivery_assignments_status_check
         CHECK (status IN ('assigned','picked_up','delivered','failed','cancelled'))`,
    );
    // At most one live assignment per vendor group, enforced by Postgres so
    // two admins assigning at once cannot both win.
    await queryInterface.sequelize.query(
      `CREATE UNIQUE INDEX uq_delivery_assignment_open
         ON delivery_assignments (order_vendor_group_id)
         WHERE status IN ('assigned','picked_up')`,
    );
    await queryInterface.addIndex('delivery_assignments', ['driver_id', 'status'], {
      name: 'idx_delivery_assignments_driver_status',
    });
    await queryInterface.addIndex('delivery_assignments', ['status'], {
      name: 'idx_delivery_assignments_status',
    });
  },

  // The DRIVER enum value stays: Postgres cannot drop an enum value without
  // rebuilding the type, and an unused value is harmless.
  down: async (queryInterface) => {
    await queryInterface.dropTable('delivery_assignments');
    await queryInterface.dropTable('drivers');
    await queryInterface.dropTable('vehicles');
  },
};
