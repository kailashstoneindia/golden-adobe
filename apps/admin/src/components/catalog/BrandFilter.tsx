import { useState } from 'react';

import { useBrandQuery } from '@/queries';
import styles from '@/styles/shared.module.css';

import { BrandPicker } from './BrandPicker';

// A compact brand filter for list screens: a button naming the current
// brand that opens the BrandPicker (decision 0063).
export function BrandFilter({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (brandId: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const selected = useBrandQuery(value);
  const label = value ? (selected.data?.name ?? '…') : 'All brands';

  return (
    <div className={styles.brandFilter}>
      <button
        type="button"
        className={`${styles.button} ${styles.buttonGhost}`}
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        Brand: {label}
      </button>
      {value ? (
        <button
          type="button"
          className={`${styles.button} ${styles.buttonGhost}`}
          onClick={() => {
            onChange(null);
            setOpen(false);
          }}
        >
          Clear brand
        </button>
      ) : null}
      {open ? (
        <div className={styles.brandFilterPanel}>
          <BrandPicker
            value={value}
            onChange={(brandId) => {
              onChange(brandId);
              setOpen(false);
            }}
          />
        </div>
      ) : null}
    </div>
  );
}
