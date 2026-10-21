export function formatCategoryPath(categoryPath: string): string {
  return categoryPath
    .split('/')
    .filter(Boolean)
    .map((segment) => formatPathSegment(segment))
    .join(' › ');
}

function formatPathSegment(segment: string): string {
  return segment
    .split('-')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}
