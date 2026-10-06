import {
  useDeleteMediaMutation,
  useReorderMediaMutation,
  useReprocessMediaMutation,
  useUpdateMediaMutation,
} from '@/queries/useMediaQueries';
import mediaStyles from '@/styles/media.module.css';
import type { ProductMedia } from '@/types/catalog.types';

type MediaGridProps = {
  productId: string;
  // Already in display order, as the API returns them.
  items: ProductMedia[];
};

export function MediaGrid({ productId, items }: MediaGridProps) {
  const update = useUpdateMediaMutation(productId);
  const reorder = useReorderMediaMutation(productId);
  const remove = useDeleteMediaMutation(productId);
  const reprocess = useReprocessMediaMutation(productId);

  const mutations = [update, reorder, remove, reprocess];
  const busy = mutations.some((m) => m.isPending);
  const failure = mutations.find((m) => m.isError)?.error;

  function move(index: number, by: -1 | 1) {
    const ids = items.map((item) => item.id);
    const target = index + by;
    [ids[index], ids[target]] = [ids[target], ids[index]];
    reorder.mutate(ids);
  }

  function confirmDelete(item: ProductMedia, position: number) {
    if (window.confirm(`Delete image ${position}? This cannot be undone.`)) {
      remove.mutate(item.id);
    }
  }

  return (
    <>
      {failure ? (
        <p className={mediaStyles.statusError} role="alert">
          {failure instanceof Error ? failure.message : 'That did not work'}
        </p>
      ) : null}

      <ul className={mediaStyles.grid} aria-label="Product images">
        {items.map((item, index) => {
          const position = index + 1;
          return (
            <li
              key={item.id}
              className={`${mediaStyles.tile} ${item.isPrimary ? mediaStyles.tilePrimary : ''}`}
            >
              <div
                className={`${mediaStyles.thumbBox} ${
                  item.status === 'failed' ? mediaStyles.thumbFailed : ''
                }`}
              >
                {item.status === 'ready' && item.variants ? (
                  <img src={item.variants.thumb} alt={`Product image ${position}`} loading="lazy" />
                ) : item.status === 'processing' ? (
                  <span>Processing…</span>
                ) : (
                  <span>Failed</span>
                )}
              </div>

              <div className={mediaStyles.badges}>
                {item.isPrimary ? <span className={mediaStyles.badge}>Primary</span> : null}
                {item.isRepresentative ? (
                  <span className={`${mediaStyles.badge} ${mediaStyles.badgeRepresentative}`}>
                    Representative
                  </span>
                ) : null}
              </div>

              {item.status === 'failed' ? (
                <p className={mediaStyles.tileError}>{item.error ?? 'Processing failed'}</p>
              ) : null}

              <div className={mediaStyles.tileActions}>
                {/* Two fixed rows, so every tile lays out the same way. */}
                <div className={mediaStyles.actionRow}>
                  {item.status === 'failed' ? (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => reprocess.mutate(item.id)}
                      aria-label={`Retry image ${position}`}
                    >
                      Retry
                    </button>
                  ) : null}
                  {/* A failed image has nothing to show, so it cannot be the primary one. */}
                  {!item.isPrimary && item.status !== 'failed' ? (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => update.mutate({ mediaId: item.id, body: { isPrimary: true } })}
                      aria-label={`Make image ${position} primary`}
                    >
                      Make primary
                    </button>
                  ) : null}
                  <button
                    type="button"
                    aria-pressed={item.isRepresentative}
                    disabled={busy}
                    onClick={() =>
                      update.mutate({
                        mediaId: item.id,
                        body: { isRepresentative: !item.isRepresentative },
                      })
                    }
                    aria-label={`Mark image ${position} as representative`}
                  >
                    Representative
                  </button>
                </div>
                <div className={mediaStyles.actionRow}>
                  <button
                    type="button"
                    disabled={busy || index === 0}
                    onClick={() => move(index, -1)}
                    aria-label={`Move image ${position} left`}
                  >
                    ←
                  </button>
                  <button
                    type="button"
                    disabled={busy || index === items.length - 1}
                    onClick={() => move(index, 1)}
                    aria-label={`Move image ${position} right`}
                  >
                    →
                  </button>
                  <button
                    type="button"
                    className={mediaStyles.deleteButton}
                    disabled={busy}
                    onClick={() => confirmDelete(item, position)}
                    aria-label={`Delete image ${position}`}
                  >
                    Delete
                  </button>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </>
  );
}
