import { User } from '../../users/models/user.model';
import { RefreshToken } from '../../users/models/refresh-token.model';
import { Vendor } from '../../vendors/models/vendor.model';
import { VendorAccountDetails } from '../../vendors/models/vendor-account-details.model';
import { City } from '../../catalog/models/city.model';
import { Artisan } from '../models/artisan.model';
import { ArtisanAccountDetails } from '../models/artisan-account-details.model';
import { ArtisanTeamMember } from '../models/artisan-team-member.model';
import { ArtisanHireRequest } from '../models/artisan-hire-request.model';
import { ArtisanCompletionEstimate } from '../models/artisan-completion-estimate.model';

// Shared model list for artisan integration tests — every model any of the
// above associates with must be present, or sequelize-typescript throws
// "X has not been defined" at connection time (Vendor associates with City).
// Mirrors apps/backend/src/modules/catalog/__tests__/test-db.ts's own
// rationale.
export const ARTISAN_TEST_MODELS = [
  User,
  RefreshToken,
  Vendor,
  VendorAccountDetails,
  City,
  Artisan,
  ArtisanAccountDetails,
  ArtisanTeamMember,
  ArtisanHireRequest,
  ArtisanCompletionEstimate,
];
