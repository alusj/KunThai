function normalizeEntry(entry, fallbackScreen = "dashboard") {
  if (typeof entry === "string") return { screen: entry, params: {}, state: {} };
  if (
    entry &&
    typeof entry === "object" &&
    typeof entry.screen === "string" &&
    entry.params && typeof entry.params === "object" &&
    entry.state && typeof entry.state === "object"
  ) {
    return entry;
  }
  return {
    screen: String(entry?.screen || fallbackScreen),
    params: entry?.params && typeof entry.params === "object" ? entry.params : {},
    state: entry?.state && typeof entry.state === "object" ? entry.state : {},
  };
}

export function createNavigationStack(initialEntry = "dashboard") {
  return [normalizeEntry(initialEntry)];
}

export function currentNavigationEntry(stack, fallbackEntry = "dashboard") {
  return normalizeEntry(Array.isArray(stack) && stack.length ? stack.at(-1) : fallbackEntry);
}

export function pushNavigationEntry(stack, entry) {
  const current = Array.isArray(stack) && stack.length ? stack : createNavigationStack();
  const next = normalizeEntry(entry);
  const active = currentNavigationEntry(current);
  if (active.screen === next.screen && active.params === next.params && active.state === next.state) return current;
  return [...current, next];
}

export function replaceNavigationEntry(stack, entry) {
  const current = Array.isArray(stack) && stack.length ? stack : createNavigationStack();
  return [...current.slice(0, -1), normalizeEntry(entry)];
}

export function popNavigationEntry(stack) {
  const current = Array.isArray(stack) && stack.length ? stack : createNavigationStack();
  return current.length > 1 ? current.slice(0, -1) : current;
}

export function resetNavigationStack(entry = "dashboard") {
  return createNavigationStack(entry);
}
