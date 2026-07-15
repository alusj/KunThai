export const MAX_PRODUCT_VIDEO_MB = 50;
export const MAX_PRODUCT_VIDEO_SECONDS = 30;

export function formatVideoMb(bytes) {
  const mb = bytes / (1024 * 1024);
  return mb >= 10 ? String(Math.round(mb)) : mb.toFixed(1);
}
