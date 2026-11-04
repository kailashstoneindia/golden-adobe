// Follow-up F11 (decision 0058). The test database is shared by suites running
// in parallel and keeps rows from earlier runs, so a test's own row is not
// guaranteed to be on page 1 of a list, least of all a list sorted oldest
// first. Walk every page instead. Returns undefined only after the last page,
// so it also proves absence.
export async function findOnAnyPage<T>(
  fetchPage: (page: number) => Promise<{ items: T[]; totalPages: number }>,
  match: (item: T) => boolean,
): Promise<T | undefined> {
  for (let page = 1; ; page += 1) {
    const result = await fetchPage(page);
    const hit = result.items.find(match);
    if (hit) return hit;
    if (page >= result.totalPages) return undefined;
  }
}
