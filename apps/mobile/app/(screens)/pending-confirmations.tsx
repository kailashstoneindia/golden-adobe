import type { PendingConfirmation } from '@golden-abode/types';
import { router } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';

import { Screen } from '../../src/components/layout/Screen';
import { Button, Card, Text } from '../../src/components/ui';
import { ERROR_MESSAGES } from '../../src/constants';
import {
  useChoosePendingCandidateMutation,
  useConfirmPendingListingMutation,
  usePendingConfirmationsQuery,
  useRejectPendingListingMutation,
} from '../../src/hooks/vendor';
import { Colors, Spacing } from '../../src/theme';

export default function PendingConfirmationsScreen() {
  const pendingQuery = usePendingConfirmationsQuery();
  const confirmMutation = useConfirmPendingListingMutation();
  const chooseMutation = useChoosePendingCandidateMutation();
  const rejectMutation = useRejectPendingListingMutation();
  const [actionError, setActionError] = useState<string | null>(null);

  const isMutating =
    confirmMutation.isPending || chooseMutation.isPending || rejectMutation.isPending;

  const handleConfirm = async (vendorListingId: string) => {
    setActionError(null);
    try {
      await confirmMutation.mutateAsync(vendorListingId);
    } catch {
      setActionError(ERROR_MESSAGES.vendorConfirmMatchFailed);
    }
  };

  const handleReject = async (vendorListingId: string) => {
    setActionError(null);
    try {
      await rejectMutation.mutateAsync(vendorListingId);
    } catch {
      setActionError(ERROR_MESSAGES.vendorConfirmMatchFailed);
    }
  };

  const handleChoose = async (options: {
    vendorListingId: string;
    masterProductId: string;
  }) => {
    setActionError(null);
    try {
      await chooseMutation.mutateAsync({
        vendorListingId: options.vendorListingId,
        body: { masterProductId: options.masterProductId },
      });
    } catch {
      setActionError(ERROR_MESSAGES.vendorConfirmMatchFailed);
    }
  };

  return (
    <Screen edges={['top']}>
      <View style={styles.root}>
        <Pressable onPress={() => router.back()} hitSlop={8}>
          <Text variant="bodyMedium" color={Colors.sky}>
            ‹ Back
          </Text>
        </Pressable>
        <Text variant="h1">Confirm matches</Text>
        <Text variant="caption" color={Colors.inkSoft}>
          Uncertain matches stay paused until you confirm, choose another product, or reject.
        </Text>

        {actionError ? (
          <Text variant="caption" color={Colors.brick}>
            {actionError}
          </Text>
        ) : null}

        <PendingListBody
          isLoading={pendingQuery.isLoading}
          isError={pendingQuery.isError}
          items={pendingQuery.data ?? []}
          isMutating={isMutating}
          onConfirm={handleConfirm}
          onReject={handleReject}
          onChoose={handleChoose}
        />
      </View>
    </Screen>
  );
}

type PendingListBodyProps = {
  isLoading: boolean;
  isError: boolean;
  items: PendingConfirmation[];
  isMutating: boolean;
  onConfirm: (vendorListingId: string) => Promise<void>;
  onReject: (vendorListingId: string) => Promise<void>;
  onChoose: (options: { vendorListingId: string; masterProductId: string }) => Promise<void>;
};

function PendingListBody({
  isLoading,
  isError,
  items,
  isMutating,
  onConfirm,
  onReject,
  onChoose,
}: PendingListBodyProps) {
  if (isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={Colors.tangerine} />
      </View>
    );
  }
  if (isError) {
    return (
      <View style={styles.centered}>
        <Text variant="body" color={Colors.brick}>
          {ERROR_MESSAGES.vendorPendingConfirmationsFailed}
        </Text>
      </View>
    );
  }
  if (items.length === 0) {
    return (
      <View style={styles.centered}>
        <Text variant="body" color={Colors.inkSoft}>
          No pending matches.
        </Text>
      </View>
    );
  }

  return (
    <FlatList
      data={items}
      keyExtractor={(item) => item.vendorListingId}
      contentContainerStyle={styles.listContent}
      ItemSeparatorComponent={ListSeparator}
      renderItem={({ item }) => (
        <PendingConfirmationCard
          item={item}
          isMutating={isMutating}
          onConfirm={onConfirm}
          onReject={onReject}
          onChoose={onChoose}
        />
      )}
      showsVerticalScrollIndicator={false}
    />
  );
}

type PendingConfirmationCardProps = {
  item: PendingConfirmation;
  isMutating: boolean;
  onConfirm: (vendorListingId: string) => Promise<void>;
  onReject: (vendorListingId: string) => Promise<void>;
  onChoose: (options: { vendorListingId: string; masterProductId: string }) => Promise<void>;
};

function PendingConfirmationCard({
  item,
  isMutating,
  onConfirm,
  onReject,
  onChoose,
}: PendingConfirmationCardProps) {
  return (
    <Card>
      <Text variant="bodyMedium">{item.matchedProductName}</Text>
      <Text variant="caption" color={Colors.inkSoft}>
        {item.matchedProductCode}
        {item.vendorSku ? ` · Your SKU ${item.vendorSku}` : ''}
      </Text>
      <Text variant="caption" color={Colors.inkSoft} style={styles.matchMeta}>
        Matched by {item.matchMethod}
        {item.matchConfidence !== null ? ` · score ${item.matchConfidence}` : ''}
      </Text>

      {item.alternatives.length > 0 ? (
        <View style={styles.alternatives}>
          <Text variant="caption" color={Colors.inkSoft}>
            Alternatives
          </Text>
          {item.alternatives.map((candidate) => (
            <Pressable
              key={candidate.masterProductId}
              style={styles.alternativeRow}
              disabled={isMutating}
              onPress={() => {
                void onChoose({
                  vendorListingId: item.vendorListingId,
                  masterProductId: candidate.masterProductId,
                });
              }}
            >
              <Text variant="caption">{candidate.productName}</Text>
              <Text variant="caption" color={Colors.tangerine}>
                Choose
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      <View style={styles.actions}>
        <Button
          title="Confirm"
          fullWidth
          disabled={isMutating}
          onPress={() => {
            void onConfirm(item.vendorListingId);
          }}
        />
        <Button
          title="Reject"
          variant="secondary"
          fullWidth
          disabled={isMutating}
          onPress={() => {
            void onReject(item.vendorListingId);
          }}
        />
      </View>
    </Card>
  );
}

function ListSeparator() {
  return <View style={styles.separator} />;
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    paddingHorizontal: Spacing.lg + 2,
    paddingTop: Spacing.sm,
    gap: Spacing.md,
  },
  listContent: {
    paddingBottom: Spacing.xxl,
  },
  separator: {
    height: Spacing.md,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.lg,
  },
  matchMeta: {
    marginTop: Spacing.xs,
  },
  alternatives: {
    marginTop: Spacing.md,
    gap: Spacing.sm,
  },
  alternativeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: Spacing.md,
  },
  actions: {
    marginTop: Spacing.md,
    gap: Spacing.sm,
  },
});
