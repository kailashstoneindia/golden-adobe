import { router } from 'expo-router';

import { ROUTES } from '../constants';
import {
  selectHasSearchLocation,
  useLocationPreferenceStore,
} from '../stores/location-preference.store';
import type { CatalogSearchParams } from '../types';

function toRouteParams(params: CatalogSearchParams): Record<string, string> {
  const routeParams: Record<string, string> = {};
  if (params.q) routeParams.q = params.q;
  if (params.category) routeParams.category = params.category;
  return routeParams;
}

export function navigateToCatalogSearch(params: CatalogSearchParams = {}): void {
  const hasSearchLocation = selectHasSearchLocation(useLocationPreferenceStore.getState());
  const routeParams = toRouteParams(params);

  if (!hasSearchLocation) {
    router.push({
      pathname: ROUTES.screens.locationGate,
      params: routeParams,
    });
    return;
  }

  router.push({
    pathname: ROUTES.screens.searchResults,
    params: routeParams,
  });
}

export function navigateToLocationGate(params: CatalogSearchParams = {}): void {
  router.push({
    pathname: ROUTES.screens.locationGate,
    params: toRouteParams(params),
  });
}

export function navigateToSearchResultsAfterLocation(params: CatalogSearchParams = {}): void {
  router.replace({
    pathname: ROUTES.screens.searchResults,
    params: toRouteParams(params),
  });
}
