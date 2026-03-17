const ISO_TZ_RE = /(Z|[+-]\d{2}:?\d{2})$/i;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const ISO_DATE_TIME_RE = /^\d{4}-\d{2}-\d{2}T/;

// Unix timestamps in seconds are always 10 digits (up through year 2286).
// Unix timestamps in milliseconds are always 13 digits (same range).
// Any all-digit string of ≤ 10 digits is unambiguously seconds and must be
// promoted to milliseconds. 11–13-digit values are already milliseconds.
// Values of 14+ digits are rejected as implausible. This digit-width test
// is more robust than a numeric threshold, which would misparse valid
// millisecond values from before Sep 2001 as seconds (e.g. 946684800000).
const MAX_UNIX_SECONDS_DIGITS = 10;
const MAX_UNIX_MS_DIGITS = 13;

function normalizeUtcIso(raw: string) {
  if (ISO_TZ_RE.test(raw)) {
    return raw;
  }
  if (ISO_DATE_RE.test(raw)) {
    return `${raw}T00:00:00Z`;
  }
  if (ISO_DATE_TIME_RE.test(raw)) {
    return `${raw}Z`;
  }
  return raw;
}

export function parseAbsoluteTimeMs(input: string): number | null {
  const raw = input.trim();
  if (!raw) {
    return null;
  }
  if (/^\d+$/.test(raw)) {
    const n = Number(raw);
    if (Number.isFinite(n) && n > 0) {
      if (raw.length <= MAX_UNIX_SECONDS_DIGITS) {
        // ≤ 10 digits: unambiguously Unix seconds — promote to milliseconds.
        // Fixes the "year 58177" bug caused by treating a seconds value as ms.
        return Math.floor(n) * 1000;
      }
      if (raw.length <= MAX_UNIX_MS_DIGITS) {
        // 11–13 digits: already milliseconds — return as-is.
        return Math.floor(n);
      }
      // 14+ digits: implausibly large epoch — fall through to ISO parse.
    }
  }
  const parsed = Date.parse(normalizeUtcIso(raw));
  return Number.isFinite(parsed) ? parsed : null;
}
