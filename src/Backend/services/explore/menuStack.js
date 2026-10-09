// Next Explore menu stack when a screen is opened. Opening a screen that is
// already further down the stack goes back to it instead of pushing a second
// copy, so links between two screens (Privacy <-> Permissions) cannot grow an
// endless back history.
export function nextMenuStack(stack = [], screen, { fromMenu = false } = {}) {
  const current = Array.isArray(stack) ? stack : [];
  if (!screen) return current;
  if (current.at(-1) === screen) return current;
  const existing = current.lastIndexOf(screen);
  if (existing !== -1) return current.slice(0, existing + 1);
  return fromMenu && current.at(-1) !== "Menu"
    ? [...current, "Menu", screen]
    : [...current, screen];
}
