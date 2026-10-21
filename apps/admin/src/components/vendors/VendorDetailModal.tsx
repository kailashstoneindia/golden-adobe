import { useEffect, useState } from 'react';
import { isEmpty } from 'lodash';

import styles from '@/styles/shared.module.css';
import type { VendorDetailModalProps, VendorDetailRowProps } from '@/types/vendors.types';
import { formatDateTime } from '@/utils/date';

export function VendorDetailModal({
  vendor,
  cities,
  registeredCategories,
  leafCategories,
  isCitiesLoading,
  isCategoriesLoading,
  isSubmitting,
  actionError,
  onClose,
  onSaveCity,
  onSaveCategories,
}: VendorDetailModalProps) {
  const [selectedCityId, setSelectedCityId] = useState(vendor.cityId ?? '');
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<string[]>(
    registeredCategories.map((category) => category.categoryId),
  );

  useEffect(() => {
    setSelectedCityId(vendor.cityId ?? '');
  }, [vendor.cityId, vendor.id]);

  useEffect(() => {
    setSelectedCategoryIds(registeredCategories.map((category) => category.categoryId));
  }, [registeredCategories, vendor.id]);

  const handleToggleCategory = (categoryId: string): void => {
    setSelectedCategoryIds((currentIds) => toggleCategoryId(currentIds, categoryId));
  };

  const handleSaveCity = async (): Promise<void> => {
    await onSaveCity(selectedCityId || null);
  };

  const handleSaveCategories = async (): Promise<void> => {
    await onSaveCategories(selectedCategoryIds);
  };

  return (
    <div className={styles.overlay} onClick={onClose} role="presentation">
      <div className={styles.modal} onClick={(event) => event.stopPropagation()} role="dialog">
        <h2 className={styles.modalTitle}>{vendor.shopName}</h2>
        <p className={styles.pageSubtitle}>Vendor profile and registration scope</p>

        <div className={styles.modalBody}>
          <DetailRow label="Address" value={vendor.address} />
          <DetailRow label="GSTIN" value={vendor.gstin || '—'} />
          <DetailRow label="Current city" value={vendor.city?.name ?? 'Not set'} />
          <DetailRow label="Updated" value={formatDateTime(vendor.updatedAt)} />

          <section className={styles.detailSections}>
            <h3 className={styles.sectionTitle}>City override</h3>
            <p className={styles.hint}>
              Pins this vendor to a launch city for search. Clear to let address GPS resolve again.
            </p>
            {isCitiesLoading ? (
              <p className={styles.pageSubtitle}>Loading cities…</p>
            ) : (
              <select
                className={styles.input}
                value={selectedCityId}
                onChange={(event) => setSelectedCityId(event.target.value)}
                disabled={isSubmitting}
              >
                <option value="">Clear city pin</option>
                {cities.map((city) => (
                  <option key={city.id} value={city.id}>
                    {city.name} ({city.state})
                  </option>
                ))}
              </select>
            )}
            <div className={styles.actions}>
              <button
                type="button"
                className={styles.buttonPrimary}
                disabled={isSubmitting || isCitiesLoading}
                onClick={() => void handleSaveCity()}
              >
                Save city
              </button>
            </div>
          </section>

          <section className={styles.detailSections}>
            <h3 className={styles.sectionTitle}>Registered leaf categories</h3>
            <p className={styles.hint}>
              Full replace of export scope. Only leaf categories may be selected.
            </p>
            {isCategoriesLoading ? (
              <p className={styles.pageSubtitle}>Loading categories…</p>
            ) : isEmpty(leafCategories) ? (
              <p className={styles.sectionEmpty}>No leaf categories available.</p>
            ) : (
              <div className={styles.checkboxList}>
                {leafCategories.map((leaf) => (
                  <label key={leaf.id} className={styles.checkboxRow}>
                    <input
                      type="checkbox"
                      checked={selectedCategoryIds.includes(leaf.id)}
                      disabled={isSubmitting}
                      onChange={() => handleToggleCategory(leaf.id)}
                    />
                    <span>{leaf.path}</span>
                  </label>
                ))}
              </div>
            )}
            <div className={styles.actions}>
              <button
                type="button"
                className={styles.buttonPrimary}
                disabled={isSubmitting || isCategoriesLoading}
                onClick={() => void handleSaveCategories()}
              >
                Save categories
              </button>
            </div>
          </section>

          {actionError ? <p className={styles.error}>{actionError}</p> : null}
        </div>

        <div className={styles.actions}>
          <button
            type="button"
            className={`${styles.button} ${styles.buttonGhost}`}
            onClick={onClose}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

function DetailRow({ label, value }: VendorDetailRowProps) {
  return (
    <div className={styles.detailRow}>
      <span className={styles.detailLabel}>{label}</span>
      <span className={styles.detailValue}>{value}</span>
    </div>
  );
}

function toggleCategoryId(currentIds: string[], categoryId: string): string[] {
  if (currentIds.includes(categoryId)) {
    return currentIds.filter((id) => id !== categoryId);
  }
  return [...currentIds, categoryId];
}
