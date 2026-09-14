import type { Settings } from 'meilisearch';

// Phase 6e (decision 0021, search-system-design.md section 5).
//
// THE single source of truth for index configuration. Settings are code,
// applied idempotently on boot — never clicked into a dashboard. Settings
// drift between environments is otherwise guaranteed, and the symptom
// ("staging ranks differently to production") is miserable to diagnose.
//
// Field names here are snake_case because they name fields in the stored
// document, which is SearchDocumentRecord — not the camelCase
// application-facing SearchDocument.

export const PRODUCTS_INDEX = 'products';

// Shadow index used by 6h's rebuild-and-swap. Named here rather than in the
// rebuild job so both indexes are provably configured identically — a shadow
// index with different settings would swap in and silently change ranking.
export const PRODUCTS_REBUILD_INDEX = 'products_rebuild';

export const PRODUCTS_PRIMARY_KEY = 'id';

export const productsSettings: Settings = {
  // Ordered: earlier = higher weight. Name beats brand beats category, which
  // is the order a customer's query terms actually tend to mean.
  searchableAttributes: ['name', 'brand', 'category_path'],

  // city_id is filtered on EVERY query, never optional — there is no
  // "search all cities" mode, because that would contradict the business
  // model decision 0018 encodes rather than merely being an unused feature.
  filterableAttributes: ['city_id', 'category_path', 'brand', 'price', 'in_stock', 'attributes'],

  // Plain fields — deliberately no per-city sortable variants. price is
  // already city-scoped at document build time, because the document itself
  // is per (product, city).
  sortableAttributes: ['price', 'updated_at'],

  typoTolerance: {
    enabled: true,
    // The one setting that must not be missed. Construction search is full of
    // numbers where a one-character edit is a DIFFERENT product:
    //   32A MCB      must not match  32B curve / 16A
    //   2.5 sq mm    must not match  1.5 sq mm
    //   600x600 tile must not match  600x300
    // Meilisearch's documented behaviour with this enabled is that queries
    // containing numbers return exact matches only. Default tolerance allows
    // one typo at 5-8 chars and two at 9+, which would actively produce wrong
    // results across this catalog.
    disableOnNumbers: true,
  },

  // Ranking rules left at Meilisearch's documented defaults. They are listed
  // explicitly rather than omitted so that a future change is a visible diff
  // rather than an invisible dependency on the server's default ordering.
  rankingRules: ['words', 'typo', 'proximity', 'attribute', 'sort', 'exactness'],
};

// Synonyms are admin-editable and live in a table (decision 0019), so they are
// NOT part of the static settings above — they are merged in at bootstrap from
// the search_synonym table. This function shapes DB rows into the map
// Meilisearch expects.
//
// IMPORTANT: Meilisearch synonyms are ONE-DIRECTIONAL — verified against
// v1.53.1, not assumed. Declaring only `mcb -> [breaker]` makes a search for
// "mcb" find breakers, but a search for "breaker" finds nothing. An admin
// entering a synonym row plainly means "these mean the same thing", so this
// expands every row into all directions: each term maps to every other term
// in its group, and multi-word phrases are included as their own keys.
export function buildSynonymMap(
  rows: Array<{ term: string; synonyms: string[] }>,
): Record<string, string[]> {
  const map: Record<string, Set<string>> = {};

  const link = (from: string, to: string) => {
    if (from === to) return;
    (map[from] ??= new Set()).add(to);
  };

  for (const row of rows) {
    if (!row.term || row.synonyms.length === 0) continue;
    // The whole equivalence group: the term plus everything it maps to.
    const group = [row.term, ...row.synonyms].map((s) => s.trim().toLowerCase()).filter(Boolean);

    for (const a of group) {
      for (const b of group) link(a, b);
    }
  }

  return Object.fromEntries(Object.entries(map).map(([term, set]) => [term, [...set]]));
}
