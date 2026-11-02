// Shared by AdminCatalogService.listProducts and VendorCatalogSearchService
// (decision 0053) — both search master_product by free text or exact
// code/MPN/GTIN, and both order by the same word_similarity ranking when a
// search term is given. Pulled out so a future fix to the ranking
// threshold or the exact-match columns lands in one place instead of
// risking the two callers silently diverging.
//
// word_similarity, not similarity — a keyword against a full product name
// scores near zero under similarity() because it penalises length
// difference. Product code/MPN/GTIN are matched exactly: a caller pasting
// "GA-0000123" wants that row, not a fuzzy neighbour.
export const WORD_SIMILARITY_MIN_SCORE = 0.5;

export function buildProductSearchClause(paramName = 'search'): string {
  return `(word_similarity(:${paramName}, mp.name) >= ${WORD_SIMILARITY_MIN_SCORE}
    OR mp.product_code = :${paramName} OR mp.mfr_part_number = :${paramName} OR mp.gtin = :${paramName})`;
}

export function productSearchOrderBy(hasSearch: boolean, paramName = 'search'): string {
  return hasSearch ? `word_similarity(:${paramName}, mp.name) DESC,` : '';
}
