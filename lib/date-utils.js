/** @returns {{ start: string, end: string, label: string }} */
export function getDateRange(type) {
  const now = new Date();
  const today = formatDate(now);

  if (type === 'daily') {
    return { start: today, end: today, label: today };
  }

  const day = now.getDay();
  const diffToMonday = day === 0 ? -6 : 1 - day;
  const monday = new Date(now);
  monday.setDate(now.getDate() + diffToMonday);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);

  const start = formatDate(monday);
  const end = formatDate(sunday);
  return { start, end, label: `${start} ~ ${end}` };
}

export function formatDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function isDateInRange(dateStr, start, end) {
  if (!dateStr) return false;
  const normalized = dateStr.slice(0, 10);
  return normalized >= start && normalized <= end;
}

export function parseDateTime(value) {
  if (!value) return '';
  return String(value).slice(0, 10);
}
