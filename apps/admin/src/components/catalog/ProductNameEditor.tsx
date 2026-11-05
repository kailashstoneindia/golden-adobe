import { useState } from 'react';

import { FormField } from '@/components/common/FormField';
import { useRenameProductMutation } from '@/queries/useCatalogQueries';
import styles from '@/styles/shared.module.css';

// The product popup's title with a way to correct the name (decision 0058
// Task 13). Only the name: the category and attribute values stay as they are.
// The server's refusal (for example a name that makes a duplicate) is shown in
// place and the form stays open.
export function ProductNameEditor({ productId, name }: { productId: string; name: string }) {
  const mutation = useRenameProductMutation();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(name);
  const [error, setError] = useState<string | null>(null);
  const trimmed = draft.trim();
  const busy = mutation.isPending;

  const start = () => {
    setDraft(name);
    setError(null);
    setEditing(true);
  };
  const save = async () => {
    setError(null);
    try {
      await mutation.mutateAsync({ productId, name: trimmed });
      setEditing(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Request failed');
    }
  };

  if (!editing) {
    return (
      <div>
        <h3 className={styles.modalTitle}>{name}</h3>
        <button type="button" className={`${styles.button} ${styles.buttonGhost}`} onClick={start}>
          Edit name
        </button>
      </div>
    );
  }
  return (
    <div>
      <FormField
        id={`product-name-${productId}`}
        label="Product name"
        value={draft}
        disabled={busy}
        onChange={setDraft}
      />
      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}
      <div className={styles.actions}>
        <button
          type="button"
          className={`${styles.button} ${styles.buttonGhost}`}
          disabled={busy}
          onClick={() => setEditing(false)}
        >
          Cancel
        </button>
        <button
          type="button"
          className={`${styles.button} ${styles.buttonPrimary}`}
          disabled={busy || trimmed === '' || trimmed === name}
          onClick={save}
        >
          Save name
        </button>
      </div>
    </div>
  );
}
