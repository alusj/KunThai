// An instantly trimmed UrMall video is the full original file played only
// between a start and an end time (no re-encoding on the phone), the same way
// Explore posts work. UrMall keeps that window on the stored video URL as a
// standard media fragment ("…/clip.mp4#t=2.40,11.80"): browsers already start
// there, every place the URL travels keeps it, and no table needs new columns.

const FRAGMENT_PATTERN = /#t=([\d.]+)(?:,([\d.]+))?$/;

// The stored URL without any trim window, for storage paths and downloads.
export function stripClipFragment(url) {
  const text = String(url || "");
  const index = text.indexOf("#");
  return index >= 0 ? text.slice(0, index) : text;
}

// Adds the trim window to an uploaded video URL. No window (or one that starts
// at 0 with no end) leaves the URL as it was.
export function withClipFragment(url, start, end) {
  const base = stripClipFragment(url);
  if (!base) return "";
  const startValue = Math.max(0, Number(start) || 0);
  const endValue = Number(end);
  const hasEnd = Number.isFinite(endValue) && endValue > startValue;
  if (!hasEnd && startValue <= 0) return base;
  return hasEnd
    ? `${base}#t=${startValue.toFixed(2)},${endValue.toFixed(2)}`
    : `${base}#t=${startValue.toFixed(2)}`;
}

// { start, end } stored on a video URL, or null when it has no trim window.
export function parseClipFragment(url) {
  const match = String(url || "").match(FRAGMENT_PATTERN);
  if (!match) return null;
  const start = Number(match[1]);
  const end = match[2] == null ? null : Number(match[2]);
  if (!Number.isFinite(start)) return null;
  return { start, end: Number.isFinite(end) ? end : null };
}
