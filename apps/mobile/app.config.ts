import type { ExpoConfig } from 'expo/config';

import appJson from './app.json';

const googleMapsApiKey = process.env.GOOGLE_MAPS_API_KEY ?? '';

export default (): ExpoConfig => {
  const expoConfig = appJson.expo as ExpoConfig;

  return {
    ...expoConfig,
    plugins: [
      ...(expoConfig.plugins ?? []),
      [
        'react-native-maps',
        {
          androidGoogleMapsApiKey: googleMapsApiKey,
          iosGoogleMapsApiKey: googleMapsApiKey,
        },
      ],
    ],
  };
};
