import { useRef, useState, type ChangeEvent, type DragEvent } from 'react';

import { MEDIA_CONSTANTS } from '@/constants/mediaConstants';
import { useRefreshProductMedia } from '@/queries/useMediaQueries';
import { mediaService } from '@/services/api/mediaService';
import mediaStyles from '@/styles/media.module.css';
import sharedStyles from '@/styles/shared.module.css';
import { formatBytes, runWithConcurrency, validateImageFile } from '@/utils/imageUpload';

type UploadItem = {
  id: string;
  name: string;
  status: 'uploading' | 'done' | 'error';
  progress: number;
  message?: string;
};

type MediaUploaderProps = {
  productId: string;
};

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : 'Upload failed';
}

// Picks or drops files and sends each one through the three-step upload (ticket,
// straight to S3, confirm). At most a few run at once, and one failing never
// stops the rest.
export function MediaUploader({ productId }: MediaUploaderProps) {
  const refresh = useRefreshProductMedia(productId);
  const counter = useRef(0);
  const [items, setItems] = useState<UploadItem[]>([]);
  const [dragging, setDragging] = useState(false);

  const patch = (id: string, change: Partial<UploadItem>) =>
    setItems((current) => current.map((item) => (item.id === id ? { ...item, ...change } : item)));

  async function addFiles(files: File[]) {
    const queued: { id: string; file: File }[] = [];
    const rejected: UploadItem[] = [];

    for (const file of files) {
      const id = `upload-${++counter.current}`;
      const problem = validateImageFile(file);
      if (problem) {
        rejected.push({ id, name: file.name, status: 'error', progress: 0, message: problem });
      } else {
        queued.push({ id, file });
      }
    }

    setItems((current) => [
      ...current,
      ...rejected,
      ...queued.map(({ id, file }) => ({
        id,
        name: file.name,
        status: 'uploading' as const,
        progress: 0,
      })),
    ]);

    await runWithConcurrency(queued, MEDIA_CONSTANTS.maxConcurrentUploads, async ({ id, file }) => {
      try {
        await mediaService.uploadImage(productId, file, (progress) => patch(id, { progress }));
        patch(id, { status: 'done', progress: 1 });
        // Refreshed per file, so each image appears as soon as it is confirmed.
        await refresh();
      } catch (error) {
        patch(id, { status: 'error', message: errorText(error) });
      }
    });
  }

  function onPick(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    // Cleared so choosing the same file again still fires a change event.
    event.target.value = '';
    if (files.length > 0) void addFiles(files);
  }

  function onDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setDragging(false);
    const files = Array.from(event.dataTransfer.files);
    if (files.length > 0) void addFiles(files);
  }

  const finished = items.filter((item) => item.status !== 'uploading');

  return (
    <div>
      <label
        className={`${mediaStyles.dropZone} ${dragging ? mediaStyles.dropZoneActive : ''}`}
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
      >
        <span>Add images</span>
        <span className={mediaStyles.hint}>
          Drop files here or click to choose. JPEG, PNG or WebP, up to{' '}
          {formatBytes(MEDIA_CONSTANTS.maxUploadBytes)} each.
        </span>
        <input
          type="file"
          multiple
          accept={MEDIA_CONSTANTS.allowedContentTypes.join(',')}
          onChange={onPick}
        />
      </label>

      {items.length > 0 ? (
        <>
          <ul className={mediaStyles.uploadList} aria-label="Uploads">
            {items.map((item) => (
              <li key={item.id} className={mediaStyles.uploadRow}>
                <span className={mediaStyles.uploadName}>{item.name}</span>
                {item.status === 'uploading' ? (
                  <span>
                    {item.progress >= 1 ? 'Finishing…' : `${Math.round(item.progress * 100)}%`}
                  </span>
                ) : item.status === 'done' ? (
                  <span className={mediaStyles.statusDone}>Uploaded</span>
                ) : (
                  <span className={mediaStyles.statusError} role="alert">
                    {item.message}
                  </span>
                )}
                {item.status === 'uploading' ? (
                  <progress
                    className={mediaStyles.progress}
                    value={item.progress}
                    max={1}
                    aria-label={`Uploading ${item.name}`}
                  />
                ) : null}
              </li>
            ))}
          </ul>
          {finished.length === items.length ? (
            <button
              type="button"
              className={`${sharedStyles.buttonGhost} ${mediaStyles.clearList}`}
              onClick={() => setItems([])}
            >
              Clear list
            </button>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
