import { useState } from 'react';

import { useSetCategoryHsnDefaultMutation } from '@/queries/useCatalogQueries';
import { ApiClientError } from '@/services';
import styles from '@/styles/shared.module.css';
import type { CategoryNode } from '@/types/catalog.types';
import { flattenCategoryOptions } from '@/utils/catalogProducts';

import { HsnPicker } from './HsnPicker';

// The HSN code (and GST rate) new products in this category start with
// (decision 0063). A category without its own default uses its nearest
// parent group's.
export function CategoryHsnDefault({ node, tree }: { node: CategoryNode; tree: CategoryNode[] }) {
  const save = useSetCategoryHsnDefaultMutation();
  const [picking, setPicking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const all = flattenCategoryOptions(tree).map(({ node: n }) => n);
  let source: CategoryNode | undefined = all.find((n) => n.id === node.parentId);
  while (source && !source.hsnCodeDefault) source = all.find((n) => n.id === source!.parentId);

  const set = async (code: string | null) => {
    setError(null);
    try {
      await save.mutateAsync({ categoryId: node.id, hsnCodeDefault: code });
      setPicking(false);
    } catch (caught) {
      setError(caught instanceof ApiClientError ? caught.message : 'Could not save the default');
    }
  };

  return (
    <section aria-label="Default HSN code">
      <h4 className={styles.sectionTitle}>Default HSN code</h4>
      <p className={styles.hint}>
        {node.hsnCodeDefault
          ? `${node.hsnCodeDefault} (set on this category)`
          : source
            ? `${source.hsnCodeDefault} (from ${source.name})`
            : 'No default. New products start without an HSN code.'}
      </p>
      <div className={styles.inlineForm}>
        <button
          type="button"
          className={`${styles.button} ${styles.buttonGhost}`}
          disabled={save.isPending}
          onClick={() => setPicking((current) => !current)}
        >
          Set default
        </button>
        {node.hsnCodeDefault ? (
          <button
            type="button"
            className={`${styles.button} ${styles.buttonGhost}`}
            disabled={save.isPending}
            onClick={() => void set(null)}
          >
            Clear
          </button>
        ) : null}
      </div>
      {picking ? (
        <HsnPicker value={node.hsnCodeDefault} onChange={(code) => void set(code)} />
      ) : null}
      {error ? <p className={styles.error}>{error}</p> : null}
    </section>
  );
}
