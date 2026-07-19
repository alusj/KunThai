export function scrollToFirstBlockingField(scope = document) {
  if (typeof document === "undefined") return;
  const root = scope?.querySelector ? scope : document;
  const target = root.querySelector('[data-field-error="true"], [aria-invalid="true"]');
  if (!target) return;

  target.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });

  const focusTarget = target.matches?.("input, select, textarea, button")
    ? target
    : target.querySelector?.("input, select, textarea, button");

  window.setTimeout(() => {
    focusTarget?.focus?.({ preventScroll: true });
  }, 260);
}

export function scrollToFirstBlockingFieldSoon(scope = document) {
  if (typeof window === "undefined") return;
  window.requestAnimationFrame(() => {
    window.requestAnimationFrame(() => scrollToFirstBlockingField(scope));
  });
}
