// Loading every controller pulls in the search module; its ESM-only client
// isn't needed to read controller metadata.
jest.mock('meilisearch', () => ({ Meilisearch: class {}, Index: class {} }));

import { readdirSync } from 'fs';
import { join } from 'path';

import { GUARDS_METADATA } from '@nestjs/common/constants';

import { ArtisansController } from '../../../modules/artisans/artisans.controller';
import { VendorCatalogImportController } from '../../../modules/catalog/vendor-catalog-import.controller';
import { VendorListingsController } from '../../../modules/catalog/vendor-listings.controller';
import { OrdersController } from '../../../modules/orders/orders.controller';
import { VendorsController } from '../../../modules/vendors/vendors.controller';
import { ALLOW_UNAPPROVED_KEY } from '../../decorators/allow-unapproved.decorator';
import { ApprovedGuard } from '../approved.guard';
import { JwtAuthGuard } from '../jwt-auth.guard';
import { ROLES_KEY } from '../../decorators/roles.decorator';
import { Role } from '@golden-abode/types';

// Decision 0059 pins exactly which controllers are gated and exactly which
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

describe('approval gate wiring (decision 0059)', () => {
  it.each(GATED)('%s carries ApprovedGuard', (_name, controller) => {
    const guards: unknown[] = Reflect.getMetadata(GUARDS_METADATA, controller) ?? [];
    expect(guards).toContain(ApprovedGuard);
  });

  it.each(GATED)('%s opens exactly the 0059 routes to pending users', (_name, controller, open) => {
    const opened = handlerNames(controller).filter((name) =>
      Reflect.getMetadata(
        ALLOW_UNAPPROVED_KEY,
        (controller.prototype as Record<string, unknown>)[name] as object,
      ),
    );
    expect(opened.sort()).toEqual([...open].sort());
  });
});

// Review fix (0059): a NEW controller that vendors or ustaads can reach must
// carry the gate too, or be listed here as deliberately ungated.
const DELIBERATELY_UNGATED = new Set([
  'AuthController', // login, OTP, refresh, logout: needed before approval
  'UsersController', // push-token registration: needed before approval
]);

function controllerFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === '__tests__' ? [] : controllerFiles(full);
    return entry.name.endsWith('.controller.ts') ? [full] : [];
  });
}

function allControllers(): Array<[string, new (...args: never[]) => unknown]> {
  const found: Array<[string, new (...args: never[]) => unknown]> = [];
  for (const file of controllerFiles(join(__dirname, '..', '..', '..', 'modules'))) {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const exported = require(file) as Record<string, unknown>;
    for (const [name, value] of Object.entries(exported)) {
      if (typeof value === 'function' && Reflect.getMetadata('path', value) !== undefined) {
        found.push([name, value as new (...args: never[]) => unknown]);
      }
    }
  }
  return found;
}

function reachableByVendorOrUstaad(controller: new (...args: never[]) => unknown): boolean {
  const guards: unknown[] = Reflect.getMetadata(GUARDS_METADATA, controller) ?? [];
  const classRoles: string[] | undefined = Reflect.getMetadata(ROLES_KEY, controller);
  const routes = handlerNames(controller).map(
    (name) => (controller.prototype as Record<string, unknown>)[name] as object,
  );
  const routeGuarded = routes.some((route) =>
    ((Reflect.getMetadata(GUARDS_METADATA, route) as unknown[]) ?? []).includes(JwtAuthGuard),
  );
  if (!guards.includes(JwtAuthGuard) && !routeGuarded) return false; // public or machine routes
  return routes.some((route) => {
    const roles: string[] | undefined = Reflect.getMetadata(ROLES_KEY, route) ?? classRoles;
    return !roles || roles.includes(Role.VENDOR) || roles.includes(Role.ARTISAN);
  });
}

describe('every controller vendors or ustaads can reach is gated (0059)', () => {
  const controllers = allControllers();

  it('finds the controllers', () => {
    expect(controllers.length).toBeGreaterThanOrEqual(20);
  });

  it('gates each one, unless deliberately ungated', () => {
    const ungated = controllers
      .filter(([, controller]) => reachableByVendorOrUstaad(controller))
      .filter(([, controller]) => {
        const guards: unknown[] = Reflect.getMetadata(GUARDS_METADATA, controller) ?? [];
        return !guards.includes(ApprovedGuard);
      })
      .map(([name]) => name)
      .filter((name) => !DELIBERATELY_UNGATED.has(name));

    expect(ungated).toEqual([]);
  });
});
