import { Capacitor } from "@capacitor/core";

export function installMobileViewportVariables() {
  if (typeof window === "undefined" || typeof document === "undefined") return () => {};

  const root = document.documentElement;
  const viewport = window.visualViewport;
  // In the app the keyboard resizes the WebView itself (Keyboard resize
  // "native"), so the page's own height is the visible height for full-screen
  // panels. The visual viewport is not: right after the page shrinks, Android
  // reports it with the keyboard taken off twice (137 px of an 853 px screen
  // on a Galaxy A06), and panels sized from it collapsed to their header,
  // showing Explore or UrMall behind the conversation. A mobile browser never
  // resizes the page for the keyboard, so there the visual viewport is the
  // measure.
  //
  // The resize also comes late: the keyboard is fully up ~330 ms before the
  // page shrinks. Meanwhile (page still full height, visual viewport smaller)
  // --kt-keyboard-overlap is the part the keyboard covers, and conversations
  // lift their message box by it, so it moves with the keyboard instead of
  // hiding under it and jumping up afterwards.
  const nativeApp = Capacitor.isNativePlatform();
  let fullHeight = window.innerHeight || 0;
  let fullWidth = window.innerWidth || 0;
  let keyboardOpen = false;

  function keyboardOverlap() {
    const pageHeight = window.innerHeight || 0;
    if (window.innerWidth !== fullWidth) {
      fullWidth = window.innerWidth;
      fullHeight = pageHeight;
    }
    fullHeight = Math.max(fullHeight, pageHeight);
    if (pageHeight < fullHeight - 1 || !viewport?.height) return 0;
    return Math.max(0, Math.round(pageHeight - viewport.height));
  }

  function syncViewport() {
    const height = Math.round((nativeApp ? window.innerHeight : viewport?.height) || window.innerHeight || 0);
    if (nativeApp) root.style.setProperty("--kt-keyboard-overlap", `${keyboardOverlap()}px`);
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
