'use strict';

// Backs PENDING_VERIFICATION_WHERE (isVerified = false AND documentUrl IS
// NOT NULL) — queried on every admin dashboard load (AdminService stat)
// and on the paginated pending-verification list (ArtisansService), both
// of which forced a full table scan without this.
module.exports = {
  up: async (queryInterface) => {
    await queryInterface.addIndex('artisans', ['is_verified', 'document_url'], {
      name: 'artisans_is_verified_document_url_idx',
    });
  },

  down: async (queryInterface) => {
    await queryInterface.removeIndex('artisans', 'artisans_is_verified_document_url_idx');
  },
};
