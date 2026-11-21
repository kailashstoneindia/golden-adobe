const IMAGE_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'webp']);

export type ImageNameCandidate = { key: string; order: number };

// Decision 0063: a bulk image is named by product code or part number,
// optionally with "_<n>" for its position (GA-0110919_2.jpg). The whole stem
// is tried first, since some part numbers end in "_<digits>" themselves; then
// the stem without that suffix, at position n.
export function parseImageFilename(name: string): { candidates: ImageNameCandidate[] } | null {
  const dot = name.lastIndexOf('.');
  if (dot <= 0) return null;
  const extension = name.slice(dot + 1).toLowerCase();
  if (!IMAGE_EXTENSIONS.has(extension)) return null;

  const stem = name.slice(0, dot).trim();
  if (!stem) return null;
  const candidates: ImageNameCandidate[] = [{ key: stem, order: 1 }];
  const numbered = /^(.+)_(\d+)$/.exec(stem);
  if (numbered) candidates.push({ key: numbered[1], order: Number(numbered[2]) });
  return { candidates };
}
