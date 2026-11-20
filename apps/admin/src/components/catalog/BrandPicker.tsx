import { useState } from 'react';

import { useBrandQuery, useBrandsQuery, useCreateBrandMutation } from '@/queries';
import styles from '@/styles/shared.module.css';
import type { BrandFormValues } from '@/types/brands.types';

import { BrandFormModal } from './BrandFormModal';

// Pick one active brand by typing part of its name or an alias (decision
// 0063). Used by the merge dialog here and by the product form and review
// queue later. With allowCreate, a brand that does not exist yet can be added
// without leaving the screen, and is then selected.
export function BrandPicker({
  value,
  onChange,
  allowCreate = false,
  excludeId,
}: {
  value: string | null;
  onChange: (brandId: string | null) => void;
  allowCreate?: boolean;
  excludeId?: string;
}) {
  const [search, setSearch] = useState('');
  const [adding, setAdding] = useState(false);
  const brandsQuery = useBrandsQuery({ search, isActive: true, page: 1, limit: 20 });
  const selected = useBrandQuery(value);
  const createBrand = useCreateBrandMutation();
  const options = (brandsQuery.data?.items ?? []).filter((brand) => brand.id !== excludeId);

  return (
    <div>
      <input
        className={`${styles.input} ${styles.pickerInput}`}
        aria-label="Find a brand"
        placeholder="Type a brand name"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
      />
      <ul role="listbox" aria-label="Brands" className={styles.pickerList}>
        {options.map((brand) => (
          <li
            key={brand.id}
            role="option"
            aria-selected={brand.id === value}
            className={`${styles.pickerOption} ${brand.id === value ? styles.pickerOptionActive : ''}`}
            onClick={() => onChange(brand.id)}
          >
            {brand.name}
          </li>
        ))}
      </ul>
      {brandsQuery.isSuccess && options.length === 0 ? (
        <p className={styles.sectionEmpty}>No active brand matches.</p>
      ) : null}
      {value && selected.data ? (
        <p className={styles.hint}>Selected: {selected.data.name}</p>
      ) : null}
      {allowCreate ? (
        <button
          type="button"
          className={`${styles.button} ${styles.buttonGhost}`}
          onClick={() => setAdding(true)}
        >
          Add brand
        </button>
      ) : null}
      {adding ? (
        <BrandFormModal
          busy={createBrand.isPending}
          onSubmit={async (body) => {
            const created = await createBrand.mutateAsync(body as BrandFormValues);
            onChange(created.id);
            return created;
          }}
          onClose={() => setAdding(false)}
        />
      ) : null}
    </div>
  );
}
