// Mirrors the Postgres helpers quarter_sort_key()/quarter_add() (used by the
// trg_snapshot_forecast_before_update / trg_ensure_rolling_forecast_placeholders
// triggers) so the frontend never needs a hardcoded quarter lookup array.

const QUARTER_RE = /^Q(\d)\s+(\d{4})$/;

export function quarterSortKey(q: string): number {
  const m = QUARTER_RE.exec(q);
  return m ? parseInt(m[2], 10) * 4 + (parseInt(m[1], 10) - 1) : -Infinity;
}

export function quarterAdd(q: string, n: number): string {
  const total = quarterSortKey(q) + n;
  return `Q${(total % 4) + 1} ${Math.floor(total / 4)}`;
}

export function sortQuarters(quarters: string[]): string[] {
  return [...quarters].sort((a, b) => quarterSortKey(a) - quarterSortKey(b));
}
