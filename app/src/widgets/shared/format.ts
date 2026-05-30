/** Compact, locale-aware due-date formatting for widget rows. */
export function formatDue(dueAt: string | null, now: Date = new Date()): string {
  if (!dueAt) return '';
  const d = new Date(dueAt);
  if (Number.isNaN(d.getTime())) return '';
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOfDue = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const dayDiff = Math.round((startOfDue - startOfToday) / 86_400_000);

  const time = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  const hasTime = !/T00:00:00/.test(dueAt);

  if (dayDiff === 0) return hasTime ? time : 'Today';
  if (dayDiff === 1) return hasTime ? `Tom ${time}` : 'Tomorrow';
  if (dayDiff === -1) return 'Yesterday';
  if (dayDiff < 0) return `${-dayDiff}d ago`;
  if (dayDiff < 7) return d.toLocaleDateString(undefined, { weekday: 'short' });
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/** Short "mm:ss" or "h:mm:ss" for Live Activity countdowns. */
export function formatDuration(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => n.toString().padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}
