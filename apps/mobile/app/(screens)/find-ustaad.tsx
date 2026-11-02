import type { ArtisanPublicProfileDto, TradeType } from '@golden-abode/types';
import { TRADE_TYPES } from '@golden-abode/types';
import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ArtisanCard } from '../../src/components/artisans';
import { DemoScreen } from '../../src/components/demo/DemoScreen';
import { Button, Chip, EmptyStateCard, Text, TextInput } from '../../src/components/ui';
import { EMPTY_STATE_MESSAGES, ERROR_MESSAGES, TRADE_TYPE_LABELS } from '../../src/constants';
import { useArtisanSearchInfiniteQuery } from '../../src/hooks/artisans';
import { useLocationPreferenceStore } from '../../src/stores/location-preference.store';
import { Colors, Spacing } from '../../src/theme';
import {
  isValidIndianPincode,
  navigateToArtisanProfile,
  sanitizePincodeDigits,
} from '../../src/utils';

export default function FindUstaadScreen() {
  const savedPincode = useLocationPreferenceStore((store) => store.preference.pincode);
  const [tradeType, setTradeType] = useState<TradeType | null>(null);
  const [pincodeText, setPincodeText] = useState(savedPincode ?? '');
  // The API matches pincode exactly and rejects partial ones, so the filter
  // only applies once all six digits are entered.
  const pincode = isValidIndianPincode(pincodeText) ? pincodeText : undefined;
  const searchQuery = useArtisanSearchInfiniteQuery({
    tradeType: tradeType ?? undefined,
    pincode,
  });
  const artisans = useMemo<ArtisanPublicProfileDto[]>(
    () => searchQuery.data?.pages.flatMap((page) => page.items) ?? [],
    [searchQuery.data],
  );

  const filters = (
    <View style={styles.filters}>
      <TextInput
        label="Site pincode"
        placeholder="302021"
        value={pincodeText}
        onChangeText={(value) => setPincodeText(sanitizePincodeDigits(value))}
        keyboardType="number-pad"
        maxLength={6}
      />
      <View style={styles.chips}>
        <Chip label="All trades" isSelected={!tradeType} onPress={() => setTradeType(null)} />
        {TRADE_TYPES.map((trade) => (
          <Chip
            key={trade}
            label={TRADE_TYPE_LABELS[trade]}
            isSelected={tradeType === trade}
            onPress={() => setTradeType(trade)}
          />
        ))}
      </View>
    </View>
  );

  return (
    <DemoScreen
      title="Find an Ustaad"
      subtitle="Verified tradespeople for your site"
      showBack
      contentStyle={styles.screenContent}
    >
      {filters}
      {searchQuery.isLoading ? (
        <Text variant="body" color={Colors.inkSoft}>
          Loading Ustaads…
        </Text>
      ) : searchQuery.isError ? (
        <EmptyStateCard
          title="Could not load Ustaads"
          message={ERROR_MESSAGES.artisanSearchFailed}
        />
      ) : artisans.length === 0 ? (
        <EmptyStateCard message={EMPTY_STATE_MESSAGES.artisanSearchEmpty} />
      ) : (
        artisans.map((artisan) => (
          <ArtisanCard key={artisan.id} artisan={artisan} onPress={navigateToArtisanProfile} />
        ))
      )}
      {searchQuery.hasNextPage ? (
        <Button
          title={searchQuery.isFetchingNextPage ? 'Loading…' : 'Load more'}
          variant="secondary"
          fullWidth
          disabled={searchQuery.isFetchingNextPage}
          onPress={() => searchQuery.fetchNextPage()}
        />
      ) : null}
    </DemoScreen>
  );
}

const styles = StyleSheet.create({
  screenContent: {
    gap: Spacing.md,
  },
  filters: {
    gap: Spacing.sm,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.xs,
  },
});
