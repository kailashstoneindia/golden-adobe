import { GUARDS_METADATA } from '@nestjs/common/constants';

import { ArtisansController } from '../../../modules/artisans/artisans.controller';
import { VendorCatalogImportController } from '../../../modules/catalog/vendor-catalog-import.controller';
import { VendorListingsController } from '../../../modules/catalog/vendor-listings.controller';
import { OrdersController } from '../../../modules/orders/orders.controller';
import { VendorsController } from '../../../modules/vendors/vendors.controller';
import { ALLOW_UNAPPROVED_KEY } from '../../decorators/allow-unapproved.decorator';
import { ApprovedGuard } from '../approved.guard';

// Decision 0057 pins exactly which controllers are gated and exactly which
// routes stay open to pending vendors and ustaads. Opening a route, or adding
// a controller vendors/ustaads use without the gate, must change this test.
const GATED: Array<[string, new (...args: never[]) => unknown, string[]]> = [
  [
    'ArtisansController',
    ArtisansController,
    [
      'search',
      'getPublicProfile',
      'onboard',
      'getMe',
      'updateMe',
      'updateAccountDetails',
      'createUploadUrl',
      'confirmDocumentUpload',
      'addTeamMember',
      'updateTeamMember',
      'removeTeamMember',
    ],
  ],
  [
    'VendorsController',
    VendorsController,
    [
      'onboard',
      'getMe',
      'updateMe',
      'updateAccountDetails',
      'getMyCategories',
      'updateOnboardingProgress',
    ],
  ],
  ['VendorListingsController', VendorListingsController, []],
  ['VendorCatalogImportController', VendorCatalogImportController, []],
  ['OrdersController', OrdersController, []],
];

function handlerNames(controller: new (...args: never[]) => unknown): string[] {
  return Object.getOwnPropertyNames(controller.prototype).filter((name) => name !== 'constructor');
}

describe('approval gate wiring (decision 0057)', () => {
  it.each(GATED)('%s carries ApprovedGuard', (_name, controller) => {
    const guards: unknown[] = Reflect.getMetadata(GUARDS_METADATA, controller) ?? [];
    expect(guards).toContain(ApprovedGuard);
  });

  it.each(GATED)('%s opens exactly the 0057 routes to pending users', (_name, controller, open) => {
    const opened = handlerNames(controller).filter((name) =>
      Reflect.getMetadata(
        ALLOW_UNAPPROVED_KEY,
        (controller.prototype as Record<string, unknown>)[name] as object,
      ),
    );
    expect(opened.sort()).toEqual([...open].sort());
  });
});
