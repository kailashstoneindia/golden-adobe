import { User } from '../../users/models/user.model';
import { RefreshToken } from '../../users/models/refresh-token.model';
import { Vendor } from '../models/vendor.model';
import { VendorAccountDetails } from '../models/vendor-account-details.model';
import { City } from '../../catalog/models/city.model';
import { PincodeCityMap } from '../../catalog/models/pincode-city-map.model';
import { Artisan } from '../../artisans/models/artisan.model';
import { ArtisanAccountDetails } from '../../artisans/models/artisan-account-details.model';
import { ArtisanTeamMember } from '../../artisans/models/artisan-team-member.model';
import { ArtisanHireRequest } from '../../artisans/models/artisan-hire-request.model';
import { ArtisanCompletionEstimate } from '../../artisans/models/artisan-completion-estimate.model';

// Mirrors apps/backend/src/modules/artisans/__tests__/test-db.ts's own
// model list (every model User/Vendor associates with, transitively,
// must be present or sequelize-typescript throws "X has not been
// defined" at connection time) plus PincodeCityMap for CityResolverService.
// This suite never exercises artisan data — they're here only because
// User.HasOne(() => Artisan) pulls the whole chain in.
export const VENDOR_TEST_MODELS = [
  User,
  RefreshToken,
  Vendor,
  VendorAccountDetails,
  City,
  PincodeCityMap,
  Artisan,
  ArtisanAccountDetails,
  ArtisanTeamMember,
  ArtisanHireRequest,
  ArtisanCompletionEstimate,
];
