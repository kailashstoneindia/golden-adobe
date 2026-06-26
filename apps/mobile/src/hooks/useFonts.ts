import { useFonts as useExpoFonts } from 'expo-font';
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
} from '@expo-google-fonts/inter';
import {
  Poppins_400Regular,
  Poppins_500Medium,
  Poppins_600SemiBold,
  Poppins_700Bold,
} from '@expo-google-fonts/poppins';
import { DMMono_400Regular, DMMono_500Medium } from '@expo-google-fonts/dm-mono';

/**
 * Loads every font weight used by the design system (Poppins, Inter, DM Mono).
 *
 * The registered keys match the family names referenced in `FontFamily` /
 * `Typography`, so once `fontsLoaded` is true those styles render correctly on
 * both iOS and Android.
 *
 * @returns `{ fontsLoaded, fontError }` — render the app only once `fontsLoaded`
 * is true (or `fontError` is set, so the UI is never permanently blocked).
 */
export function useFonts(): { fontsLoaded: boolean; fontError: Error | null } {
  const [fontsLoaded, fontError] = useExpoFonts({
    Poppins_400Regular,
    Poppins_500Medium,
    Poppins_600SemiBold,
    Poppins_700Bold,
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    DMMono_400Regular,
    DMMono_500Medium,
  });

  return { fontsLoaded, fontError };
}
