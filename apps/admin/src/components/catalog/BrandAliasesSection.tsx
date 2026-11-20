import { useState } from 'react';
import type { BrandDto } from '@golden-abode/types';

import { useAddBrandAliasMutation, useRemoveBrandAliasMutation } from '@/queries';
import { ApiClientError } from '@/services';
import styles from '@/styles/shared.module.css';

const messageOf = (error: unknown, fallback: string) =>
  error instanceof ApiClientError ? error.message : fallback;

// Other spellings that mean this brand ("Havells India Ltd", "H.I.L"). The
// import and add-product screens resolve them to this brand (decision 0063).
export function BrandAliasesSection({ brand }: { brand: BrandDto }) {
  const addAlias = useAddBrandAliasMutation(brand.id);
  const removeAlias = useRemoveBrandAliasMutation(brand.id);
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const busy = addAlias.isPending || removeAlias.isPending;

  const add = async () => {
    const alias = text.trim();
    if (!alias) return;
    setError(null);
    try {
      await addAlias.mutateAsync(alias);
      setText('');
    } catch (caught) {
      setError(messageOf(caught, 'Could not add the alias'));
    }
  };

  const remove = async (aliasId: string) => {
    setError(null);
    try {
      await removeAlias.mutateAsync(aliasId);
    } catch (caught) {
      setError(messageOf(caught, 'Could not remove the alias'));
    }
  };

  return (
    <div>
      <h3 className={styles.sectionTitle}>Other spellings</h3>
      {brand.aliases.length === 0 ? (
        <p className={styles.sectionEmpty}>None yet.</p>
      ) : (
        <ul className={styles.chipList}>
          {brand.aliases.map((alias) => (
            <li key={alias.id} className={styles.chip}>
              <span>{alias.alias}</span>
              <button
                type="button"
                className={styles.chipRemove}
                aria-label={`Remove alias ${alias.alias}`}
                disabled={busy}
                onClick={() => remove(alias.id)}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className={styles.inlineForm}>
        <input
          className={styles.input}
          aria-label="New alias"
          placeholder="e.g. Havells India Ltd"
          maxLength={160}
          value={text}
          disabled={busy}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') add();
          }}
        />
        <button
          type="button"
          className={`${styles.button} ${styles.buttonGhost}`}
          disabled={busy || !text.trim()}
          onClick={add}
        >
          Add alias
        </button>
      </div>
      {error ? <p className={styles.error}>{error}</p> : null}
    </div>
  );
}
