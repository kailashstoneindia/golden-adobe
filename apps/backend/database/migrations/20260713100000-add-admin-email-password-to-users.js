'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('users', 'email', {
      type: Sequelize.STRING,
      allowNull: true,
      unique: true,
    });

    await queryInterface.addColumn('users', 'password_hash', {
      type: Sequelize.STRING,
      allowNull: true,
    });

    await queryInterface.changeColumn('users', 'phone', {
      type: Sequelize.STRING,
      allowNull: true,
      unique: true,
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeColumn('users', 'password_hash');
    await queryInterface.removeColumn('users', 'email');

    await queryInterface.sequelize.query(`
      UPDATE users
      SET phone = CONCAT('+admin-', id)
      WHERE phone IS NULL
    `);

    await queryInterface.changeColumn('users', 'phone', {
      type: Sequelize.STRING,
      allowNull: false,
      unique: true,
    });
  },
};
