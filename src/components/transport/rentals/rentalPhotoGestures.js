export function photoPanBounds(viewport, image, scale) {
  if (!viewport.width || !viewport.height || !image.width || !image.height) return { x: 0, y: 0 };
  const fit = Math.min(viewport.width / image.width, viewport.height / image.height);
  return { x: Math.max(0, (image.width * fit * scale - viewport.width) / 2), y: Math.max(0, (image.height * fit * scale - viewport.height) / 2) };
}
export function clampPhotoPan(position, bounds) {
  return { x: Math.max(-bounds.x, Math.min(bounds.x, position.x)), y: Math.max(-bounds.y, Math.min(bounds.y, position.y)) };
}
export function photoSwipeAction(dx, dy) {
  if (dy > 90 && dy > Math.abs(dx) * 1.3) return "close";
  if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.3) return dx < 0 ? "next" : "previous";
  return null;
}
