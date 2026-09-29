'use strict';
const { v4: uuidv4 } = require('uuid');

// Five separate NCR cities (decision 0020) — Delhi, Gurugram, Faridabad,
// Noida, Ghaziabad — never treated as one unified metro market. A customer
// in Gurugram sees only Gurugram vendors.
//
// Centroids are the illustrative city-centre coordinates from decision
// 0020's own SQL sketch — "to be confirmed at seeding time, not treated as
// final here." Not independently re-verified by this seeder; revisit
// before relying on them for anything beyond development/testing.
module.exports = {
  up: async (queryInterface) => {
    const now = new Date();
    await queryInterface.bulkInsert('city', [
      {
        id: uuidv4(),
        name: 'Delhi',
        slug: 'delhi',
        state: 'Delhi',
        centroid_lat: 28.6139,
        centroid_lng: 77.209,
        is_active: true,
        created_at: now,
        updated_at: now,
      },
      {
        id: uuidv4(),
        name: 'Gurugram',
        slug: 'gurugram',
        state: 'Haryana',
        centroid_lat: 28.4595,
        centroid_lng: 77.0266,
        is_active: true,
        created_at: now,
        updated_at: now,
      },
      {
        id: uuidv4(),
        name: 'Faridabad',
        slug: 'faridabad',
        state: 'Haryana',
        centroid_lat: 28.4089,
        centroid_lng: 77.3178,
        is_active: true,
        created_at: now,
        updated_at: now,
      },
      {
        id: uuidv4(),
        name: 'Noida',
        slug: 'noida',
        state: 'Uttar Pradesh',
        centroid_lat: 28.5355,
        centroid_lng: 77.391,
        is_active: true,
        created_at: now,
        updated_at: now,
      },
      {
        id: uuidv4(),
        name: 'Ghaziabad',
        slug: 'ghaziabad',
        state: 'Uttar Pradesh',
        centroid_lat: 28.6692,
        centroid_lng: 77.4538,
        is_active: true,
        created_at: now,
        updated_at: now,
      },
    ]);
  },

  down: async (queryInterface) => {
    await queryInterface.bulkDelete('city', {
      slug: ['delhi', 'gurugram', 'faridabad', 'noida', 'ghaziabad'],
    });
  },
};
