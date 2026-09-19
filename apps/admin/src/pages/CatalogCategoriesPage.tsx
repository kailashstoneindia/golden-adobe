import { useMemo, useState } from 'react';

import { useCategoryAttributesQuery, useCategoryTreeQuery } from '@/queries/useCatalogQueries';
import styles from '@/styles/shared.module.css';
import catalogStyles from '@/styles/catalog.module.css';
import type {
  CategoryAttributeRowProps,
  CategoryNode,
  CategoryTreeRowProps,
} from '@/types/catalog.types';

function countLeaves(nodes: CategoryNode[]): number {
  let total = 0;
  for (const node of nodes) {
    if (node.isLeaf) {
      total += 1;
    }
    total += countLeaves(node.children);
  }
  return total;
}

function countProducts(nodes: CategoryNode[]): number {
  let total = 0;
  for (const node of nodes) {
    total += node.productCount;
    total += countProducts(node.children);
  }
  return total;
}

function matchesQuery(node: CategoryNode, query: string): boolean {
  if (!query) {
    return true;
  }
  if (node.name.toLowerCase().includes(query) || node.path.toLowerCase().includes(query)) {
    return true;
  }
  return node.children.some((child) => matchesQuery(child, query));
}

function filterTree(nodes: CategoryNode[], query: string): CategoryNode[] {
  if (!query) {
    return nodes;
  }
  return nodes
    .filter((node) => matchesQuery(node, query))
    .map((node) => ({
      ...node,
      children: filterTree(node.children, query),
    }));
}

function collectExpandableIds(nodes: CategoryNode[]): string[] {
  const ids: string[] = [];
  for (const node of nodes) {
    if (node.children.length > 0) {
      ids.push(node.id);
      ids.push(...collectExpandableIds(node.children));
    }
  }
  return ids;
}

function CategoryTreeRow({
  node,
  selectedId,
  expandedIds,
  onSelect,
  onToggle,
}: CategoryTreeRowProps) {
  const hasChildren = node.children.length > 0;
  const isExpanded = expandedIds.has(node.id);
  const isSelected = selectedId === node.id;
  const leafTotal = hasChildren ? countLeaves(node.children) : 0;
  const productTotal = hasChildren ? countProducts(node.children) + node.productCount : node.productCount;

  return (
    <li className={catalogStyles.treeItem}>
      <div
        className={`${catalogStyles.treeRow} ${isSelected ? catalogStyles.treeRowSelected : ''} ${
          node.level === 1 ? catalogStyles.treeRowRoot : ''
        } ${catalogStyles[`treeLevel${Math.min(node.level, 4)}`]}`}
      >
        {hasChildren ? (
          <button
            type="button"
            className={catalogStyles.treeToggle}
            onClick={() => onToggle(node.id)}
            aria-label={isExpanded ? `Collapse ${node.name}` : `Expand ${node.name}`}
          >
            {isExpanded ? '▾' : '▸'}
          </button>
        ) : (
          <span className={catalogStyles.treeSpacer} />
        )}

        <button
          type="button"
          className={catalogStyles.treeSelect}
          onClick={() => onSelect(node)}
        >
          <span className={catalogStyles.treeName}>{node.name}</span>
          <span className={catalogStyles.treeMeta}>
            {node.isLeaf ? (
              <>
                <span className={catalogStyles.badgeLeaf}>Leaf</span>
                {node.unitOfMeasure ? <span>{node.unitOfMeasure}</span> : null}
                <span>{node.productCount} SKU</span>
              </>
            ) : (
              <>
                <span className={catalogStyles.badgeBranch}>Group</span>
                <span>{leafTotal} leaves</span>
                <span>{productTotal} SKU</span>
              </>
            )}
          </span>
        </button>
      </div>

      {hasChildren && isExpanded ? (
        <ul className={catalogStyles.treeChildren}>
          {node.children.map((child) => (
            <CategoryTreeRow
              key={child.id}
              node={child}
              selectedId={selectedId}
              expandedIds={expandedIds}
              onSelect={onSelect}
              onToggle={onToggle}
            />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

function AttributeRow({ attribute }: CategoryAttributeRowProps) {
  return (
    <li className={catalogStyles.attrItem}>
      <div className={catalogStyles.attrHead}>
        <strong>{attribute.name}</strong>
        <span className={catalogStyles[`scope${attribute.scope}`]}>{attribute.scope}</span>
        {attribute.isVariantDefining ? (
          <span className={catalogStyles.badgeVariant} title="Splits products into separate SKUs">
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
        <div className={catalogStyles.attrOptions}>{attribute.options.join(' · ')}</div>
      ) : null}
    </li>
  );
}

export function CatalogCategoriesPage() {
  const [selected, setSelected] = useState<CategoryNode | null>(null);
  const [searchText, setSearchText] = useState('');
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set());
  const treeQuery = useCategoryTreeQuery();
  const attributesQuery = useCategoryAttributesQuery(selected?.id ?? null);

  const tree = useMemo(() => treeQuery.data ?? [], [treeQuery.data]);
  const normalizedQuery = searchText.trim().toLowerCase();
  const visibleTree = useMemo(
    () => filterTree(tree, normalizedQuery),
    [tree, normalizedQuery],
  );
  const leafCount = useMemo(() => countLeaves(tree), [tree]);
  const searchExpandedIds = useMemo(() => {
    if (!normalizedQuery) {
      return null;
    }
    return new Set(collectExpandableIds(visibleTree));
  }, [normalizedQuery, visibleTree]);
  const effectiveExpandedIds = searchExpandedIds ?? expandedIds;

  const handleToggle = (nodeId: string): void => {
    setExpandedIds((current) => {
      const next = new Set(current);
      if (next.has(nodeId)) {
        next.delete(nodeId);
        return next;
      }
      next.add(nodeId);
      return next;
    });
  };

  const handleExpandAllVisible = (): void => {
    setExpandedIds(new Set(collectExpandableIds(visibleTree)));
  };

  const handleCollapseAll = (): void => {
    setExpandedIds(new Set());
  };

  if (treeQuery.isLoading) {
    return <p className={styles.pageSubtitle}>Loading categories…</p>;
  }
  if (treeQuery.isError) {
    return <p className={styles.error}>Could not load the category tree.</p>;
  }

  return (
    <section className={catalogStyles.categoriesPage}>
      <header className={catalogStyles.categoriesHeader}>
        <div>
          <h2 className={styles.pageTitle}>Categories</h2>
          <p className={styles.pageSubtitle}>
            {tree.length} roots · {leafCount} leaves. Products attach to leaves only.
          </p>
        </div>
        <div className={catalogStyles.categoriesToolbar}>
          <input
            className={`${styles.input} ${catalogStyles.categoriesSearch}`}
            placeholder="Filter categories…"
            value={searchText}
            onChange={(event) => setSearchText(event.target.value)}
          />
          <div className={catalogStyles.categoriesActions}>
            <button
              type="button"
              className={`${styles.button} ${styles.buttonGhost} ${catalogStyles.categoriesAction}`}
              onClick={handleExpandAllVisible}
            >
              Expand
            </button>
            <button
              type="button"
              className={`${styles.button} ${styles.buttonGhost} ${catalogStyles.categoriesAction}`}
              onClick={handleCollapseAll}
            >
              Collapse
            </button>
          </div>
        </div>
      </header>

      <div className={catalogStyles.splitPane}>
        <div className={catalogStyles.treePanel}>
          {visibleTree.length === 0 ? (
            <div className={styles.empty}>No categories match that filter.</div>
          ) : (
            <ul className={catalogStyles.treeList}>
              {visibleTree.map((node) => (
                <CategoryTreeRow
                  key={node.id}
                  node={node}
                  selectedId={selected?.id ?? null}
                  expandedIds={effectiveExpandedIds}
                  onSelect={setSelected}
                  onToggle={handleToggle}
                />
              ))}
            </ul>
          )}
        </div>

        <aside className={catalogStyles.detailPane}>
          {!selected ? (
            <div className={styles.empty}>Select a category to inspect its attributes.</div>
          ) : (
            <>
              <div className={catalogStyles.detailHeader}>
                <h3 className={catalogStyles.detailTitle}>{selected.name}</h3>
                <span className={selected.isLeaf ? catalogStyles.badgeLeaf : catalogStyles.badgeBranch}>
                  {selected.isLeaf ? 'Leaf' : 'Group'}
                </span>
              </div>
              <p className={catalogStyles.detailPath}>{selected.path}</p>
              <p className={catalogStyles.detailStats}>
                {selected.productCount} products
                {selected.unitOfMeasure ? ` · unit ${selected.unitOfMeasure}` : ''}
              </p>

              {attributesQuery.isLoading ? (
                <p className={styles.pageSubtitle}>Loading attributes…</p>
              ) : attributesQuery.isError ? (
                <p className={styles.error}>Could not load attributes.</p>
              ) : (
                <>
                  <p className={styles.hint}>
                    {attributesQuery.data?.attributes.length ?? 0} attributes in effect for import
                    templates.
                  </p>
                  <ul className={catalogStyles.attrList}>
                    {(attributesQuery.data?.attributes ?? []).map((attribute) => (
                      <AttributeRow key={attribute.id} attribute={attribute} />
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
