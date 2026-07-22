export function formatKm(meters: number): string {
  return `${(meters / 1000).toFixed(2)} km`;
}

export function formatDuration(totalSeconds: number): string {
  const s = Math.round(totalSeconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = h > 0 ? String(m).padStart(2, '0') : String(m);
  return `${h > 0 ? `${h}:` : ''}${mm}:${String(sec).padStart(2, '0')}`;
}

/** Average pace as min/km, e.g. "5:48 /km". */
export function formatPace(meters: number, seconds: number): string {
  if (meters <= 0 || seconds <= 0) return '—';
  const secPerKm = seconds / (meters / 1000);
  const m = Math.floor(secPerKm / 60);
  const s = Math.round(secPerKm % 60);
  return s === 60 ? `${m + 1}:00 /km` : `${m}:${String(s).padStart(2, '0')} /km`;
}

export function formatDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString(undefined, {
        weekday: 'short',
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      });
}
