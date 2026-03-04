/**
 * Converts a date-only ISO string (e.g. "2026-03-04") into the start of the
 * **next** day so it can be used with exclusive upper-bound queries (`< value`).
 * Full ISO timestamps are left as-is.
 */
export function toExclusiveEndDate(iso: string): Date {
  const date = new Date(iso);
  if (!iso.includes('T')) {
    date.setUTCDate(date.getUTCDate() + 1);
  }
  return date;
}
