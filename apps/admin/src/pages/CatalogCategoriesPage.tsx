import { useMemo, useState } from 'react';

import { useCategoryAttributesQuery, useCategoryTreeQuery } from '@/queries/useCatalogQueries';
import styles from '@/styles/shared.module.css';
import catalogStyles from '@/styles/catalog.module.css';
import type { CategoryNode } from '@/types/catalog.types';

function countLeaves(nodes: CategoryNode[]): number {
  return nodes.reduce((n, node) => n + (node.isLeaf ? 1 : 0) + countLeaves(node.children), 0);
}

function CategoryRow({
  node,
  selectedId,
  onSelect,
}: {
  node: CategoryNode;
  selectedId: string | null;
  onSelect: (node: CategoryNode) => void;
}) {
  const [expanded, setExpanded] = useState(node.level === 1);
  const hasChildren = node.children.length > 0;

  return (
    <>
      <tr
        className={`${styles.clickableRow} ${selectedId === node.id ? catalogStyles.rowSelected : ''}`}
        onClick={() => onSelect(node)}
      >
        <td>
          <span style={{ paddingLeft: `${(node.level - 1) * 20}px` }}>
            {hasChildren ? (
              <button
                type="button"
                className={catalogStyles.treeToggle}
                onClick={(event) => {
                  event.stopPropagation();
                  setExpanded((value) => !value);
                }}
                aria-label={expanded ? 'Collapse' : 'Expand'}
              >
                {expanded ? '▾' : '▸'}
              </button>
            ) : (
              <span className={catalogStyles.treeSpacer} />
            )}
            {node.name}
          </span>
        </td>
        <td>
          <span className={node.isLeaf ? catalogStyles.badgeLeaf : catalogStyles.badgeBranch}>
            {node.isLeaf ? 'Leaf' : 'Group'}
          </span>
        </td>
        <td>{node.unitOfMeasure ?? '—'}</td>
        <td>{node.productCount}</td>
      </tr>
      {expanded
        ? node.children.map((child) => (
            <CategoryRow key={child.id} node={child} selectedId={selectedId} onSelect={onSelect} />
          ))
        : null}
    </>
  );
}

export function CatalogCategoriesPage() {
  const [selected, setSelected] = useState<CategoryNode | null>(null);
  const treeQuery = useCategoryTreeQuery();
  const attributesQuery = useCategoryAttributesQuery(selected?.id ?? null);

  const tree = useMemo(() => treeQuery.data ?? [], [treeQuery.data]);
  const leafCount = useMemo(() => countLeaves(tree), [tree]);

  if (treeQuery.isLoading) {
    return <p className={styles.pageSubtitle}>Loading categories…</p>;
  }
  if (treeQuery.isError) {
    return <p className={styles.error}>Could not load the category tree.</p>;
  }

  return (
    <section>
      <h2 className={styles.pageTitle}>Categories</h2>
      <p className={styles.pageSubtitle}>
        {tree.length} top-level categories · {leafCount} leaves. Products attach to leaves only.
        Select a category to see the attributes a product in it will carry.
      </p>

      <div className={catalogStyles.splitPane}>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Category</th>
                <th>Type</th>
                <th>Unit</th>
                <th>Products</th>
              </tr>
            </thead>
            <tbody>
              {tree.map((node) => (
                <CategoryRow
                  key={node.id}
                  node={node}
                  selectedId={selected?.id ?? null}
                  onSelect={setSelected}
                />
              ))}
            </tbody>
          </table>
        </div>

        <aside className={catalogStyles.detailPane}>
          {!selected ? (
            <div className={styles.empty}>Select a category to inspect its attributes.</div>
          ) : (
            <>
              <h3 className={catalogStyles.detailTitle}>{selected.name}</h3>
              <p className={catalogStyles.detailPath}>{selected.path}</p>

              {attributesQuery.isLoading ? (
                <p className={styles.pageSubtitle}>Loading attributes…</p>
              ) : attributesQuery.isError ? (
                <p className={styles.error}>Could not load attributes.</p>
              ) : (
                <>
                  <p className={styles.hint}>
                    {attributesQuery.data?.attributes.length ?? 0} attributes in effect — the
                    category&apos;s own, plus everything inherited from its ancestors and the global
                    set. This is exactly what an import template for it contains.
                  </p>
                  <ul className={catalogStyles.attrList}>
                    {attributesQuery.data?.attributes.map((attribute) => (
                      <li key={attribute.id} className={catalogStyles.attrItem}>
                        <div className={catalogStyles.attrHead}>
                          <strong>{attribute.name}</strong>
                          <span className={catalogStyles[`scope${attribute.scope}`]}>
                            {attribute.scope}
                          </span>
                          {attribute.isVariantDefining ? (
                            <span
                              className={catalogStyles.badgeVariant}
                              title="Splits products into separate SKUs"
                            >
                              variant
                            </span>
                          ) : null}
                        </div>
                        <div className={catalogStyles.attrMeta}>
                          <code>{attribute.code}</code> · {attribute.dataType}
                          {attribute.unit ? ` (${attribute.unit})` : ''}
                          {attribute.scope === 'inherited' && attribute.declaredOn
                            ? ` · from ${attribute.declaredOn}`
                            : ''}
                        </div>
                        {attribute.options.length > 0 ? (
                          <div className={catalogStyles.attrOptions}>
                            {attribute.options.join(' · ')}
                          </div>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </>
          )}
        </aside>
      </div>
    </section>
  );
}
