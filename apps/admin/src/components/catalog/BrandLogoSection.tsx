import { useState } from 'react';
import type { BrandDto } from '@golden-abode/types';

import { useUploadBrandLogoMutation } from '@/queries';
import styles from '@/styles/shared.module.css';

// Same limits as the API (decision 0063). SVG is refused: it can carry script.
const LOGO_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const LOGO_MAX_BYTES = 2 * 1024 * 1024;

export function BrandLogoSection({ brand }: { brand: BrandDto }) {
  const upload = useUploadBrandLogoMutation(brand.id);
  const [error, setError] = useState<string | null>(null);

  const pick = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    if (!LOGO_TYPES.includes(file.type)) {
      setError('Use a JPEG, PNG or WebP image');
      return;
    }
    if (file.size > LOGO_MAX_BYTES) {
      setError('The logo must be 2 MB or smaller');
      return;
    }
    try {
      await upload.mutateAsync(file);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not upload the logo');
    }
  };

  return (
    <div>
      <h3 className={styles.sectionTitle}>Logo</h3>
      {brand.logoUrl ? (
        <img className={styles.logoPreview} src={brand.logoUrl} alt={`${brand.name} logo`} />
      ) : (
        <p className={styles.sectionEmpty}>No logo yet.</p>
      )}
      <label className={styles.label} htmlFor={`brand-logo-${brand.id}`}>
        {upload.isPending ? 'Uploading…' : 'Upload logo'}
      </label>
      <input
        id={`brand-logo-${brand.id}`}
        aria-label="Upload logo"
        type="file"
        accept={LOGO_TYPES.join(',')}
        disabled={upload.isPending}
        onChange={(event) => {
          pick(event.target.files?.[0]);
          event.target.value = '';
        }}
      />
      {error ? <p className={styles.error}>{error}</p> : null}
    </div>
  );
}
