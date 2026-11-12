// "2h 15m" style age of something that has been waiting since `since`.
export function formatWaiting(since: string, now: number = Date.now()): string {
  const minutes = Math.max(0, Math.floor((now - new Date(since).getTime()) / 60000));
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ${minutes % 60}m`;
  return `${Math.floor(hours / 24)}d ${hours % 24}h`;
}
