export type CustomerLocationSource = 'pincode' | 'coordinates';

export type CustomerLocationPreference = {
  pincode: string | null;
  latitude: number | null;
  longitude: number | null;
  source: CustomerLocationSource | null;
};
