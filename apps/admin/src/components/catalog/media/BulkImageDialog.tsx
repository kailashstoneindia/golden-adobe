import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { BrandPicker } from '@/components/catalog/BrandPicker';
import { CATALOG_QUERY_KEYS } from '@/queries/useCatalogQueries';
import { ApiClientError, catalogService } from '@/services';
import { mediaService } from '@/services/api/mediaService';
import styles from '@/styles/shared.module.css';
import type { ProductKeyLookup } from '@/types/catalog.types';

import { parseImageFilename } from './bulkImageNames';

const PARALLEL_UPLOADS = 4;

type Planned = {
  file: File;
  productId: string | null;
  productLabel: string | null;
  becomesPrimary: boolean;
  // Why the file will not be uploaded, when it will not.
  skip: string | null;
  result: 'uploaded' | string | null;
};

// For each file: the first candidate key that matched a product wins.
function plan(files: File[], lookup: ProductKeyLookup): Planned[] {
  const byKey = new Map(lookup.items.map((item) => [item.key, item]));
  const ambiguous = new Set(lookup.ambiguousKeys);
  const primaryTaken = new Set<string>();

  return files.map((file) => {
    const parsed = parseImageFilename(file.name);
    const base = { file, productId: null, productLabel: null, becomesPrimary: false, result: null };
    if (!parsed) return { ...base, skip: 'Not an image' };

    const hit = parsed.candidates.map((c) => byKey.get(c.key)).find(Boolean);
    if (!hit) {
      const several = parsed.candidates.some((c) => ambiguous.has(c.key));
      return { ...base, skip: several ? 'Matches several brands' : 'No match' };
    }
    const productLabel = `${hit.productName} (${hit.productCode})`;
    if (hit.status === 'deprecated') {
      return { ...base, productLabel, skip: 'Retired product, skipped' };
    }
    const becomesPrimary = !hit.hasPrimary && !primaryTaken.has(hit.productId);
    if (becomesPrimary) primaryTaken.add(hit.productId);
    return { ...base, productId: hit.productId, productLabel, becomesPrimary, skip: null };
  });
}

// Decision 0063: many images at once, each named by product code or the
// brand's part number (GA-0110919.jpg, MCB-10_2.png). Each matched file goes
// through the same presign, upload and confirm as a single image.
export function BulkImageDialog({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const [brandId, setBrandId] = useState<string | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [rows, setRows] = useState<Planned[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [summary, setSummary] = useState<string | null>(null);

  useEffect(() => {
    if (files.length === 0) return;
    const keys = [
      ...new Set(
        files.flatMap((f) => parseImageFilename(f.name)?.candidates.map((c) => c.key) ?? []),
      ),
    ];
    if (keys.length === 0) {
      setRows(plan(files, { items: [], ambiguousKeys: [] }));
      return;
    }
    let current = true;
    setError(null);
    catalogService
      .lookupProductKeys(keys, brandId)
      .then((lookup) => current && setRows(plan(files, lookup)))
      .catch(
        (caught) =>
          current &&
          setError(caught instanceof ApiClientError ? caught.message : 'Could not match the files'),
      );
    return () => {
      current = false;
    };
  }, [files, brandId]);

  const toUpload = rows.filter((row) => row.productId && !row.skip);

  const upload = async () => {
    setUploading(true);
    setSummary(null);
    const queue = [...toUpload];
    const results = new Map<File, string>();
    const worker = async () => {
      for (let next = queue.shift(); next; next = queue.shift()) {
        try {
          await mediaService.uploadImage(next.productId!, next.file);
          results.set(next.file, 'uploaded');
        } catch (caught) {
          results.set(next.file, caught instanceof Error ? caught.message : 'Upload failed');
        }
        setRows((current) =>
          current.map((row) =>
            results.has(row.file) ? { ...row, result: results.get(row.file)! } : row,
          ),
        );
      }
    };
    await Promise.all(Array.from({ length: Math.min(PARALLEL_UPLOADS, queue.length) }, worker));

    const uploaded = [...results.values()].filter((r) => r === 'uploaded').length;
    const failed = results.size - uploaded;
    const skipped = rows.length - toUpload.length;
    setSummary(`${uploaded} uploaded, ${skipped} skipped${failed ? `, ${failed} failed` : ''}`);
    setUploading(false);
    void queryClient.invalidateQueries({ queryKey: CATALOG_QUERY_KEYS.all });
  };

  return (
    <div className={styles.overlay} onClick={uploading ? undefined : onClose} role="presentation">
      <div
        className={`${styles.modal} ${styles.modalWide}`}
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-label="Upload images in bulk"
      >
        <h2 className={styles.modalTitle}>Upload images in bulk</h2>
        <p className={styles.pageSubtitle}>
          Name each file by product code (GA-0110919.jpg) or by the brand&apos;s part number; add
          _2, _3 for more pictures of the same product. JPEG, PNG or WebP.
        </p>
        <div className={styles.modalBody}>
          <div>
            <span className={styles.label}>
              These file names are part numbers of brand… (optional)
            </span>
            <BrandPicker value={brandId} onChange={setBrandId} />
          </div>
          <label className={styles.label} htmlFor="bulk-image-files">
            Image files
          </label>
          <input
            id="bulk-image-files"
            type="file"
            multiple
            accept="image/jpeg,image/png,image/webp"
            disabled={uploading}
            onChange={(event) => {
              setSummary(null);
              setFiles(Array.from(event.target.files ?? []));
            }}
          />
          {error ? <p className={styles.error}>{error}</p> : null}

          {rows.length > 0 ? (
            <div className={styles.tableWrap}>
              <table className={styles.table} aria-label="Files">
                <thead>
                  <tr>
                    <th>File</th>
                    <th>Product</th>
                    <th>Result</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.file.name}>
                      <td>{row.file.name}</td>
                      <td>
                        {row.productLabel ?? '—'}
                        {row.becomesPrimary && !row.skip ? (
                          <span className={styles.hint}> · Will become primary</span>
                        ) : null}
                      </td>
                      <td>
                        {row.skip ??
                          (row.result === 'uploaded'
                            ? 'Uploaded'
                            : (row.result ?? (uploading ? 'Waiting…' : 'Ready')))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
          {summary ? <p className={styles.hint}>{summary}</p> : null}
        </div>
        <div className={styles.actions}>
          <button
            type="button"
            className={`${styles.button} ${styles.buttonGhost}`}
            disabled={uploading}
            onClick={onClose}
          >
            Close
          </button>
          <button
            type="button"
            className={`${styles.button} ${styles.buttonPrimary}`}
            disabled={uploading || toUpload.length === 0 || Boolean(summary)}
            onClick={() => void upload()}
          >
            {`Upload ${toUpload.length} image${toUpload.length === 1 ? '' : 's'}`}
          </button>
        </div>
      </div>
    </div>
  );
}
