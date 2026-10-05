import { useProductMediaQuery } from '@/queries/useMediaQueries';
import catalogStyles from '@/styles/catalog.module.css';
import mediaStyles from '@/styles/media.module.css';
import sharedStyles from '@/styles/shared.module.css';

import { MediaGrid } from './MediaGrid';
import { MediaUploader } from './MediaUploader';

type ProductMediaPanelProps = {
  productId: string;
};

// The "Images" section of the product detail (decision 0033): upload, then
// manage what is there. While anything is still being processed the list
// refreshes itself, so a tile turns from "Processing…" to the picture on its own.
export function ProductMediaPanel({ productId }: ProductMediaPanelProps) {
  const mediaQuery = useProductMediaQuery(productId);
  const images = (mediaQuery.data ?? []).filter((item) => item.type === 'image');

  return (
    <section className={mediaStyles.panel} aria-label="Images">
      <h4 className={catalogStyles.detailTitle}>Images</h4>

      <MediaUploader productId={productId} />

      {mediaQuery.isLoading ? (
        <p className={sharedStyles.pageSubtitle}>Loading images…</p>
      ) : mediaQuery.isError ? (
        <p className={sharedStyles.error} role="alert">
          Could not load the images.
        </p>
      ) : images.length === 0 ? (
        <div className={sharedStyles.sectionEmpty}>
          No images yet. Add one above; the first image becomes the primary image.
        </div>
      ) : (
        <MediaGrid productId={productId} items={images} />
      )}
    </section>
  );
}
