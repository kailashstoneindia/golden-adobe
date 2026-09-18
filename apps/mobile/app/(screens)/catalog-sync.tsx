import type { VendorCategoryDto, VendorImportResult } from '@golden-abode/types';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Screen } from '../../src/components/layout/Screen';
import { Button, Card, Text } from '../../src/components/ui';
import { ERROR_MESSAGES, ROUTES } from '../../src/constants';
import {
  useDownloadVendorExportMutation,
  usePendingConfirmationsQuery,
  useUploadVendorCatalogMutation,
  useVendorCategoriesQuery,
  useVendorExportCountQuery,
} from '../../src/hooks/vendor';
import {
  CatalogFileToolsError,
  pickCatalogWorkbook,
  saveAndShareCatalogExport,
} from '../../src/services';
import { Colors, Radius, Spacing } from '../../src/theme';

export default function CatalogSyncScreen() {
  const categoriesQuery = useVendorCategoriesQuery();
  const pendingQuery = usePendingConfirmationsQuery();
  const downloadMutation = useDownloadVendorExportMutation();
  const uploadMutation = useUploadVendorCatalogMutation();

  const [selectedCategoryIds, setSelectedCategoryIds] = useState<string[]>([]);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [lastUploadResult, setLastUploadResult] = useState<VendorImportResult | null>(null);

  const categories = categoriesQuery.data ?? [];
  const exportScope = useMemo(
    () => ({ leafCategoryIds: selectedCategoryIds }),
    [selectedCategoryIds],
  );
  const exportCountQuery = useVendorExportCountQuery(
    exportScope,
    selectedCategoryIds.length > 0,
  );

  const handleToggleCategory = (categoryId: string) => {
    setSelectedCategoryIds((current) => toggleCategoryId(current, categoryId));
  };

  const handleDownload = async () => {
    if (selectedCategoryIds.length === 0) {
      setActionError('Select at least one category to export.');
      return;
    }
    setActionError(null);
    setActionMessage(null);
    try {
      const buffer = await downloadMutation.mutateAsync(exportScope);
      await saveAndShareCatalogExport({
        buffer,
        filename: `vendor-catalog-export-${Date.now()}.xlsx`,
      });
      setActionMessage('Catalog sheet ready — save it from the share sheet.');
    } catch (error: unknown) {
      setActionError(resolveFileActionError(error, ERROR_MESSAGES.vendorCatalogExportFailed));
    }
  };

  const handleUpload = async () => {
    setActionError(null);
    setActionMessage(null);
    try {
      const file = await pickCatalogWorkbook();
      if (!file) {
        return;
      }
      const result = await uploadMutation.mutateAsync(file);
      setLastUploadResult(result);
      setActionMessage(buildUploadSummary(result));
    } catch (error: unknown) {
      setActionError(resolveFileActionError(error, ERROR_MESSAGES.vendorCatalogUploadFailed));
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
        <Text variant="h1">Sync catalog</Text>
        <Text variant="body" color={Colors.inkSoft}>
          Download a pre-filled sheet, fill prices and stock, then upload. Do not create products
          from scratch.
        </Text>

        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <Card>
            <Text variant="bodyMedium">1. Choose categories</Text>
            <CategoryPickerBody
              isLoading={categoriesQuery.isLoading}
              isError={categoriesQuery.isError}
              categories={categories}
              selectedCategoryIds={selectedCategoryIds}
              onToggle={handleToggleCategory}
            />
            {selectedCategoryIds.length > 0 ? (
              <Text variant="caption" color={Colors.inkSoft} style={styles.countLine}>
                {exportCountQuery.isLoading
                  ? 'Counting rows…'
                  : `${exportCountQuery.data?.rowCount ?? 0} products in export`}
              </Text>
            ) : null}
            <Button
              title={downloadMutation.isPending ? 'Preparing…' : 'Download Excel'}
              fullWidth
              disabled={downloadMutation.isPending || selectedCategoryIds.length === 0}
              onPress={() => {
                void handleDownload();
              }}
            />
          </Card>

          <Card>
            <Text variant="bodyMedium">2. Upload filled sheet</Text>
            <Text variant="caption" color={Colors.inkSoft} style={styles.meta}>
              Upload the completed .xlsx file. Matches may need confirmation.
            </Text>
            <Button
              title={uploadMutation.isPending ? 'Uploading…' : 'Upload .xlsx'}
              variant="secondary"
              fullWidth
              disabled={uploadMutation.isPending}
              onPress={() => {
                void handleUpload();
              }}
            />
            {lastUploadResult ? (
              <Text variant="caption" color={Colors.inkSoft} style={styles.meta}>
                Linked {lastUploadResult.linkedCount} · Pending{' '}
                {lastUploadResult.pendingConfirmationCount} · Review{' '}
                {lastUploadResult.needsReviewCount} · Rejected {lastUploadResult.rejectedCount}
              </Text>
            ) : null}
          </Card>

          <Card>
            <Text variant="bodyMedium">3. Review matches</Text>
            <Text variant="caption" color={Colors.inkSoft} style={styles.meta}>
              {(pendingQuery.data?.length ?? 0) > 0
                ? `${pendingQuery.data?.length} listing(s) waiting for confirmation`
                : 'No pending matches right now'}
            </Text>
            <Button
              title="Open pending confirmations"
              variant="secondary"
              fullWidth
              onPress={() => router.push(ROUTES.screens.pendingConfirmations)}
            />
          </Card>

          {actionMessage ? (
            <Text variant="caption" color={Colors.sage}>
              {actionMessage}
            </Text>
          ) : null}
          {actionError ? (
            <Text variant="caption" color={Colors.brick}>
              {actionError}
            </Text>
          ) : null}
        </ScrollView>
      </View>
    </Screen>
  );
}

type CategoryPickerBodyProps = {
  isLoading: boolean;
  isError: boolean;
  categories: VendorCategoryDto[];
  selectedCategoryIds: string[];
  onToggle: (categoryId: string) => void;
};

function CategoryPickerBody({
  isLoading,
  isError,
  categories,
  selectedCategoryIds,
  onToggle,
}: CategoryPickerBodyProps) {
  if (isLoading) {
    return <ActivityIndicator color={Colors.tangerine} style={styles.meta} />;
  }
  if (isError) {
    return (
      <Text variant="caption" color={Colors.brick} style={styles.meta}>
        {ERROR_MESSAGES.vendorCategoriesFailed}
      </Text>
    );
  }
  if (categories.length === 0) {
    return (
      <Text variant="caption" color={Colors.inkSoft} style={styles.meta}>
        {ERROR_MESSAGES.vendorCategoriesEmpty}
      </Text>
    );
  }

  return (
    <View style={styles.categoryList}>
      {categories.map((category) => {
        const isSelected = selectedCategoryIds.includes(category.categoryId);
        return (
          <Pressable
            key={category.categoryId}
            style={[styles.categoryChip, isSelected ? styles.categoryChipActive : null]}
            onPress={() => onToggle(category.categoryId)}
          >
            <Text variant="caption" color={isSelected ? Colors.white : Colors.ink}>
              {category.name}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function toggleCategoryId(current: string[], categoryId: string): string[] {
  if (current.includes(categoryId)) {
    return current.filter((id) => id !== categoryId);
  }
  return [...current, categoryId];
}

function buildUploadSummary(result: VendorImportResult): string {
  return `Upload complete — ${result.linkedCount} linked, ${result.pendingConfirmationCount} pending.`;
}

function resolveFileActionError(error: unknown, fallback: string): string {
  if (error instanceof CatalogFileToolsError) {
    return error.message;
  }
  return fallback;
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    paddingHorizontal: Spacing.lg + 2,
    paddingTop: Spacing.sm,
    gap: Spacing.md,
  },
  content: {
    gap: Spacing.md,
    paddingBottom: Spacing.xxl,
  },
  meta: {
    marginTop: Spacing.sm,
    marginBottom: Spacing.md,
  },
  countLine: {
    marginVertical: Spacing.sm,
  },
  categoryList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
    marginTop: Spacing.md,
    marginBottom: Spacing.sm,
  },
  categoryChip: {
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Colors.line,
    backgroundColor: Colors.white,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  categoryChipActive: {
    backgroundColor: Colors.navy,
    borderColor: Colors.navy,
  },
});
