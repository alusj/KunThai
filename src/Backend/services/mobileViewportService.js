export function installMobileViewportVariables() {
  if (typeof window === "undefined" || typeof document === "undefined") return () => {};

  const root = document.documentElement;
  const viewport = window.visualViewport;
  let keyboardOpen = false;

  function syncViewport() {
    const height = Math.round(viewport?.height || window.innerHeight || 0);
    if (height > 0) root.style.setProperty("--kt-visual-viewport-height", `${height}px`);
    root.style.setProperty("--kt-visual-viewport-top", `${Math.max(0, Math.round(viewport?.offsetTop || 0))}px`);
  }

  function publishKeyboardState(open, keyboardHeight = 0) {
    keyboardOpen = open;
    root.dataset.ktKeyboardOpen = open ? "true" : "false";
    root.style.setProperty("--kt-keyboard-height", `${open ? Math.max(0, Math.round(keyboardHeight || 0)) : 0}px`);
    syncViewport();
    window.requestAnimationFrame(syncViewport);
    window.setTimeout(syncViewport, open ? 260 : 120);
    window.dispatchEvent(new CustomEvent("kuntai-keyboard-viewport-change", {
      detail: { open, keyboardHeight: open ? Number(keyboardHeight || 0) : 0 },
    }));
  }

  function handleKeyboardShow(event) {
    publishKeyboardState(true, event?.keyboardHeight || event?.detail?.keyboardHeight || 0);
  }

  function handleKeyboardHide() {
    publishKeyboardState(false, 0);
  }

  syncViewport();
  root.dataset.ktKeyboardOpen = "false";
  viewport?.addEventListener("resize", syncViewport);
  viewport?.addEventListener("scroll", syncViewport);
  window.addEventListener("orientationchange", syncViewport);
  window.addEventListener("resize", syncViewport);
  window.addEventListener("keyboardWillShow", handleKeyboardShow);
  window.addEventListener("keyboardDidShow", handleKeyboardShow);
  window.addEventListener("keyboardWillHide", handleKeyboardHide);
  window.addEventListener("keyboardDidHide", handleKeyboardHide);

  return () => {
    viewport?.removeEventListener("resize", syncViewport);
    viewport?.removeEventListener("scroll", syncViewport);
    window.removeEventListener("orientationchange", syncViewport);
    window.removeEventListener("resize", syncViewport);
    window.removeEventListener("keyboardWillShow", handleKeyboardShow);
    window.removeEventListener("keyboardDidShow", handleKeyboardShow);
    window.removeEventListener("keyboardWillHide", handleKeyboardHide);
    window.removeEventListener("keyboardDidHide", handleKeyboardHide);
    if (keyboardOpen) publishKeyboardState(false, 0);
  };
}
