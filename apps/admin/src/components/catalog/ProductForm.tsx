import { useMemo, useState } from 'react';

import { FormField } from '@/components/common/FormField';
import {
  useCategoryAttributesQuery,
  useCategoryTreeQuery,
  useCreateProductMutation,
  useUpdateProductMutation,
} from '@/queries/useCatalogQueries';
import { ApiClientError, catalogService } from '@/services';
import styles from '@/styles/shared.module.css';
import type {
  CategoryNode,
  CreateProductRequest,
  UpdateProductRequest,
} from '@/types/catalog.types';
import { flattenCategoryOptions } from '@/utils/catalogProducts';

import { BrandPicker } from './BrandPicker';
import { HsnPicker } from './HsnPicker';

export type ProductFormValues = {
  categoryId: string;
  name: string;
  brandId: string | null;
  mfrPartNumber: string;
  gtin: string;
  hsnCode: string | null;
  gstRate: string;
  countryOfOrigin: string;
  attributes: Record<string, string>;
};

const EMPTY: ProductFormValues = {
  categoryId: '',
  name: '',
  brandId: null,
  mfrPartNumber: '',
  gtin: '',
  hsnCode: null,
  gstRate: '18',
  countryOfOrigin: 'India',
  attributes: {},
};

type Errors = Partial<Record<'categoryId' | 'name' | 'countryOfOrigin' | 'gstRate', string>>;

// The category's own HSN default, else the nearest ancestor's (decision 0063).
export function effectiveHsnDefault(tree: CategoryNode[], categoryId: string): string | null {
  const nodes = flattenCategoryOptions(tree).map(({ node }) => node);
  let node = nodes.find((n) => n.id === categoryId);
  while (node) {
    if (node.hsnCodeDefault) return node.hsnCodeDefault;
    node = nodes.find((n) => n.id === node!.parentId);
  }
  return null;
}

function validate(values: ProductFormValues, mode: 'create' | 'edit'): Errors {
  const errors: Errors = {};
  if (mode === 'create' && !values.categoryId) errors.categoryId = 'Choose a category';
  if (!values.name.trim()) errors.name = 'Name is required';
  if (!values.countryOfOrigin.trim()) errors.countryOfOrigin = 'Country of origin is required';
  const rate = Number(values.gstRate);
  if (values.gstRate === '' || Number.isNaN(rate) || rate < 0 || rate > 100) {
    errors.gstRate = 'GST rate must be between 0 and 100';
  }
  return errors;
}

const attributeList = (values: ProductFormValues) =>
  Object.entries(values.attributes)
    .filter(([, value]) => value.trim())
    .map(([code, value]) => ({ code, value: value.trim() }));

// Edit sends only what changed, so a save never rewrites untouched data.
function changesFrom(initial: ProductFormValues, values: ProductFormValues): UpdateProductRequest {
  const changes: UpdateProductRequest = {};
  const text = (v: string) => v.trim();
  if (text(values.name) !== text(initial.name)) changes.name = text(values.name);
  if (values.brandId && values.brandId !== initial.brandId) changes.brandId = values.brandId;
  if (text(values.mfrPartNumber) !== text(initial.mfrPartNumber)) {
    changes.mfrPartNumber = text(values.mfrPartNumber) || null;
  }
  if (text(values.gtin) !== text(initial.gtin)) changes.gtin = text(values.gtin) || null;
  if (values.hsnCode !== initial.hsnCode) changes.hsnCode = values.hsnCode;
  if (Number(values.gstRate) !== Number(initial.gstRate)) changes.gstRate = Number(values.gstRate);
  if (text(values.countryOfOrigin) !== text(initial.countryOfOrigin)) {
    changes.countryOfOrigin = text(values.countryOfOrigin);
  }
  if (JSON.stringify(attributeList(values)) !== JSON.stringify(attributeList(initial))) {
    changes.attributeValues = attributeList(values);
  }
  return changes;
}

// Add a product (decision 0063), or edit one. Category is chosen on create
// and fixed afterwards. Required (variant-defining) attributes are starred;
// a draft may be saved without them, and the readiness checklist shows what
// is still missing before it can be published.
export function ProductForm({
  mode,
  productId,
  initial,
  categoryPath,
  isGeneric = false,
  onSaved,
  onCancel,
}: {
  mode: 'create' | 'edit';
  productId?: string;
  initial?: Partial<ProductFormValues>;
  categoryPath?: string;
  isGeneric?: boolean;
  onSaved: (productId: string) => void;
  onCancel?: () => void;
}) {
  const start = useMemo(() => ({ ...EMPTY, ...initial }), [initial]);
  const [values, setValues] = useState<ProductFormValues>(start);
  const [errors, setErrors] = useState<Errors>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const treeQuery = useCategoryTreeQuery();
  const attributesQuery = useCategoryAttributesQuery(values.categoryId || null);
  const create = useCreateProductMutation();
  const update = useUpdateProductMutation(productId ?? '');
  const busy = create.isPending || update.isPending;

  const leaves = useMemo(
    () => flattenCategoryOptions(treeQuery.data ?? []).filter(({ node }) => node.isLeaf),
    [treeQuery.data],
  );
  const set = <K extends keyof ProductFormValues>(key: K, value: ProductFormValues[K]) =>
    setValues((previous) => ({ ...previous, [key]: value }));

  const chooseCategory = async (categoryId: string) => {
    setValues((previous) => ({ ...previous, categoryId, attributes: {} }));
    const code = effectiveHsnDefault(treeQuery.data ?? [], categoryId);
    if (!code) return;
    const match = (await catalogService.listHsnCodes(code)).find((h) => h.code === code);
    setValues((previous) => ({
      ...previous,
      hsnCode: code,
      gstRate: match ? String(match.gstRate) : previous.gstRate,
    }));
  };

  const submit = async () => {
    const found = validate(values, mode);
    setErrors(found);
    setServerError(null);
    if (Object.keys(found).length > 0) return;

    try {
      if (mode === 'create') {
        const body: CreateProductRequest = {
          categoryId: values.categoryId,
          name: values.name.trim(),
          ...(values.brandId ? { brandId: values.brandId } : {}),
          ...(values.mfrPartNumber.trim() ? { mfrPartNumber: values.mfrPartNumber.trim() } : {}),
          ...(values.gtin.trim() ? { gtin: values.gtin.trim() } : {}),
          ...(values.hsnCode ? { hsnCode: values.hsnCode } : {}),
          gstRate: Number(values.gstRate),
          countryOfOrigin: values.countryOfOrigin.trim(),
          attributeValues: attributeList(values),
        };
        const created = await create.mutateAsync(body);
        onSaved(created.id);
      } else {
        const changes = changesFrom(start, values);
        if (Object.keys(changes).length > 0) await update.mutateAsync(changes);
        onSaved(productId!);
      }
    } catch (error) {
      setServerError(
        error instanceof ApiClientError ? error.message : 'Could not save the product',
      );
    }
  };

  const attributes = attributesQuery.data?.attributes ?? [];

  return (
    <form
      className={styles.modalBody}
      aria-label={mode === 'create' ? 'New product' : 'Edit product'}
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      {mode === 'create' ? (
        <div>
          <label className={styles.label} htmlFor="product-category">
            Category
          </label>
          <select
            id="product-category"
            className={styles.input}
            value={values.categoryId}
            disabled={busy}
            onChange={(event) => void chooseCategory(event.target.value)}
          >
            <option value="">Choose a category</option>
            {leaves.map(({ node }) => (
              <option key={node.id} value={node.id}>
                {node.path}
              </option>
            ))}
          </select>
          {errors.categoryId ? <p className={styles.error}>{errors.categoryId}</p> : null}
        </div>
      ) : (
        <p className={styles.hint}>Category: {categoryPath} (cannot be changed)</p>
      )}

      <FormField
        id="product-name"
        label="Name *"
        value={values.name}
        onChange={(v) => set('name', v)}
        disabled={busy}
        maxLength={255}
      />
      {errors.name ? <p className={styles.error}>{errors.name}</p> : null}

      {isGeneric ? (
        <p className={styles.hint}>Generic product: it has no brand.</p>
      ) : (
        <div>
          <span className={styles.label}>Brand</span>
          <BrandPicker value={values.brandId} onChange={(id) => set('brandId', id)} allowCreate />
        </div>
      )}

      <FormField
        id="product-mpn"
        label="Part number (MPN)"
        value={values.mfrPartNumber}
        onChange={(v) => set('mfrPartNumber', v)}
        disabled={busy}
        maxLength={64}
      />
      <FormField
        id="product-gtin"
        label="GTIN / barcode"
        value={values.gtin}
        onChange={(v) => set('gtin', v)}
        disabled={busy}
        maxLength={20}
      />

      <div>
        <span className={styles.label}>HSN code</span>
        <HsnPicker
          value={values.hsnCode}
          onChange={(code, rate) =>
            setValues((previous) => ({
              ...previous,
              hsnCode: code,
              gstRate: rate === null ? previous.gstRate : String(rate),
            }))
          }
        />
      </div>
      <FormField
        id="product-gst"
        label="GST rate (%) *"
        type="number"
        value={values.gstRate}
        onChange={(v) => set('gstRate', v)}
        disabled={busy}
      />
      {errors.gstRate ? <p className={styles.error}>{errors.gstRate}</p> : null}
      <FormField
        id="product-origin"
        label="Country of origin *"
        value={values.countryOfOrigin}
        onChange={(v) => set('countryOfOrigin', v)}
        disabled={busy}
        maxLength={64}
      />
      {errors.countryOfOrigin ? <p className={styles.error}>{errors.countryOfOrigin}</p> : null}

      {attributes.length > 0 ? <h3 className={styles.sectionTitle}>Attributes</h3> : null}
      {attributes.map((attribute) => {
        const id = `product-attr-${attribute.code}`;
        const label = `${attribute.name}${attribute.unit ? ` (${attribute.unit})` : ''}${
          attribute.isVariantDefining ? ' *' : ''
        }`;
        const value = values.attributes[attribute.code] ?? '';
        const setAttr = (next: string) =>
          set('attributes', { ...values.attributes, [attribute.code]: next });
        return attribute.dataType === 'enum' ? (
          <div key={attribute.code}>
            <label className={styles.label} htmlFor={id}>
              {label}
            </label>
            <select
              id={id}
              className={styles.input}
              value={value}
              disabled={busy}
              onChange={(event) => setAttr(event.target.value)}
            >
              <option value="">Choose…</option>
              {attribute.options.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </div>
        ) : (
          <FormField
            key={attribute.code}
            id={id}
            label={label}
            type={attribute.dataType === 'number' ? 'number' : 'text'}
            value={value}
            onChange={setAttr}
            disabled={busy}
          />
        );
      })}

      {serverError ? <p className={styles.error}>{serverError}</p> : null}
      <div className={styles.actions}>
        {onCancel ? (
          <button
            type="button"
            className={`${styles.button} ${styles.buttonGhost}`}
            disabled={busy}
            onClick={onCancel}
          >
            Cancel
          </button>
        ) : null}
        <button
          type="submit"
          className={`${styles.button} ${styles.buttonPrimary}`}
          disabled={busy}
        >
          {mode === 'create' ? 'Save draft' : 'Save changes'}
        </button>
      </div>
    </form>
  );
}
