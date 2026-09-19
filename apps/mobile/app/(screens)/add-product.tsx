import { Redirect } from 'expo-router';

import { ROUTES } from '../../src/constants';

/** Free-form add-product is retired — vendors sync from the master catalog. */
export default function AddProductScreen() {
  return <Redirect href={ROUTES.screens.catalogSync} />;
}
