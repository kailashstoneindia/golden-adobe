import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { City } from './models/city.model';
import { PincodeCityMap } from './models/pincode-city-map.model';

export type CityResolutionInput = {
  pincode?: string;
  latitude?: number;
  longitude?: number;
};

export type CityResolutionResult = {
  cityId: string | null;
  resolvedVia: 'coordinates' | 'pincode' | 'none';
  // Set only when BOTH signals were available and disagreed — surfaced so
  // a caller can log/monitor how often this happens (decision 0019 accepts
  // this as a residual risk at launch-city scale, not something to hide).
  disagreedWithPincode?: boolean;
};

// Combined pincode + GPS resolution (decisions 0018, 0019) — NOT "use
// whichever is available", a combination with a tie-break: when both are
// present and disagree, coordinates win, because a pincode is an India
// Post ADMINISTRATIVE boundary that can straddle two cities, while a
// coordinate pair carries no such ambiguity.
//
// GPS resolves to the NEAREST ACTIVE city by haversine distance to
// city.centroid_lat/lng — deliberately not reverse-geocoding, to avoid a
// third-party API dependency entirely. At launch-city scale (a handful of
// rows) a distance calculation over `city` is enough.
//
// This SAME logic double-serves vendor onboarding (0019): a new vendor's
// city_id can be auto-suggested from vendors.latitude/longitude at signup,
// admin free to override — see resolveNearestCity(), the half of this
// service vendor onboarding actually calls.
@Injectable()
export class CityResolverService {
  constructor(
    @InjectModel(City)
    private readonly cityModel: typeof City,
    @InjectModel(PincodeCityMap)
    private readonly pincodeCityMapModel: typeof PincodeCityMap,
  ) {}

  async resolveCity(input: CityResolutionInput): Promise<CityResolutionResult> {
    const [pincodeCityId, coordinateCityId] = await Promise.all([
      input.pincode ? this.resolveByPincode(input.pincode) : Promise.resolve(null),
      input.latitude !== undefined && input.longitude !== undefined
        ? this.resolveNearestCity(input.latitude, input.longitude)
        : Promise.resolve(null),
    ]);

    if (coordinateCityId && pincodeCityId) {
      return {
        cityId: coordinateCityId,
        resolvedVia: 'coordinates',
        disagreedWithPincode: coordinateCityId !== pincodeCityId,
      };
    }
    if (coordinateCityId) {
      return { cityId: coordinateCityId, resolvedVia: 'coordinates' };
    }
    if (pincodeCityId) {
      return { cityId: pincodeCityId, resolvedVia: 'pincode' };
    }
    return { cityId: null, resolvedVia: 'none' };
  }

  private async resolveByPincode(pincode: string): Promise<string | null> {
    const trimmed = pincode.trim();
    const entry = await this.pincodeCityMapModel.findOne({
      where: { pincode: trimmed },
      include: [{ model: City, where: { isActive: true }, required: true }],
    });
    return entry?.cityId ?? null;
  }

  // Nearest ACTIVE city centroid by haversine distance. A plain SQL
  // computation rather than a loaded-in-JS loop — at launch-city scale
  // (a handful of rows) either is cheap, but doing it in SQL means the
  // same function backs both customer resolution and vendor onboarding's
  // auto-suggest without duplicating the distance formula.
  async resolveNearestCity(latitude: number, longitude: number): Promise<string | null> {
    const cities = await this.cityModel.findAll({ where: { isActive: true } });
    if (cities.length === 0) return null;

    let nearest: City | null = null;
    let nearestDistanceKm = Infinity;
    for (const city of cities) {
      const distance = this.haversineKm(
        latitude,
        longitude,
        Number(city.centroidLat),
        Number(city.centroidLng),
      );
      if (distance < nearestDistanceKm) {
        nearestDistanceKm = distance;
        nearest = city;
      }
    }
    return nearest?.id ?? null;
  }

  private haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const R = 6371; // Earth radius, km
    const toRad = (deg: number) => (deg * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }
}
