import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Keyboard } from "@capacitor/keyboard";

const KEYBOARD_SETTLE_DELAYS = [60, 180, 360];

// Keeps a conversation pinned to its newest message while the native keyboard
// animates. iOS reports more than one viewport size during that animation, so a
// single scrollIntoView call is not enough and can accidentally pan the whole
// WebView instead of the thread.
export function useKeyboardAwareConversation({ activeKey = "", itemCount = 0, threadRef }) {
  const timersRef = useRef([]);
  const [focused, setFocused] = useState(false);

  const clearTimers = useCallback(() => {
    timersRef.current.forEach((timer) => window.clearTimeout(timer));
    timersRef.current = [];
  }, []);

  const scrollToLatest = useCallback((behavior = "auto") => {
    const node = threadRef.current;
    if (!node) return;
    node.scrollTo({ top: node.scrollHeight, left: 0, behavior });
  }, [threadRef]);

  const settleConversation = useCallback(() => {
    clearTimers();
    window.requestAnimationFrame(() => scrollToLatest("auto"));
    timersRef.current = KEYBOARD_SETTLE_DELAYS.map((delay) => (
      window.setTimeout(() => scrollToLatest("auto"), delay)
    ));
  }, [clearTimers, scrollToLatest]);

  useLayoutEffect(() => {
    settleConversation();
  }, [activeKey, itemCount, settleConversation]);

  useEffect(() => {
    const viewport = window.visualViewport;
    const handleViewportChange = () => settleConversation();
    viewport?.addEventListener("resize", handleViewportChange);
    viewport?.addEventListener("scroll", handleViewportChange);
    window.addEventListener("kuntai-keyboard-viewport-change", handleViewportChange);
    return () => {
      viewport?.removeEventListener("resize", handleViewportChange);
      viewport?.removeEventListener("scroll", handleViewportChange);
      window.removeEventListener("kuntai-keyboard-viewport-change", handleViewportChange);
      clearTimers();
    };
  }, [clearTimers, settleConversation]);

  useEffect(() => {
    if (!activeKey) return undefined;

    // Configure the WebKit form accessory before the user touches the field.
    // Changing it only from onFocus is too late for the first iOS keyboard
    // presentation, because WKWebView has already created the accessory view.
    Keyboard.setAccessoryBarVisible({ isVisible: false }).catch(() => {});

    return () => {
      // Other forms still receive the platform's standard previous/next bar.
      Keyboard.setAccessoryBarVisible({ isVisible: true }).catch(() => {});
    };
  }, [activeKey]);

  const handleInputPointerDown = useCallback(() => {
    Keyboard.setAccessoryBarVisible({ isVisible: false }).catch(() => {});
  }, []);

  const handleInputFocus = useCallback(() => {
    setFocused(true);
    Keyboard.setAccessoryBarVisible({ isVisible: false }).catch(() => {});
    settleConversation();
  }, [settleConversation]);

  const handleInputBlur = useCallback(() => {
    setFocused(false);
  }, []);

  return {
    focused,
    handleInputBlur,
    handleInputFocus,
    handleInputPointerDown,
    scrollToLatest,
    settleConversation,
  };
}
