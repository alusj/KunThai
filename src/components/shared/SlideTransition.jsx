import { useEffect, useRef, useState } from "react";

export const SLIDE_TRANSITION_MS = 360;

export function getSlidePanelClass(action) {
  if (action === "push") return "kt-explore-stack-enter";
  if (action === "pop") return "kt-explore-stack-leave-right";
  return "translate-x-0";
}

export function useSlidePanel(activeKey, duration = SLIDE_TRANSITION_MS) {
  const [visibleKey, setVisibleKey] = useState(activeKey);
  const [action, setAction] = useState(activeKey ? "push" : "idle");
  const visibleKeyRef = useRef(activeKey);
  const timerRef = useRef(null);

  useEffect(() => {
    if (timerRef.current) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    if (activeKey === visibleKeyRef.current) {
      setAction("idle");
      return undefined;
    }

    if (activeKey) {
      visibleKeyRef.current = activeKey;
      setVisibleKey(activeKey);
      setAction("push");
      timerRef.current = window.setTimeout(() => {
        setAction("idle");
        timerRef.current = null;
      }, duration);
      return undefined;
    }

    if (visibleKeyRef.current) {
      setAction("pop");
      timerRef.current = window.setTimeout(() => {
        visibleKeyRef.current = null;
        setVisibleKey(null);
        setAction("idle");
        timerRef.current = null;
      }, duration);
    }

    return undefined;
  }, [activeKey, duration]);

  useEffect(() => {
    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
    };
  }, []);

  return {
    visibleKey,
    action,
    panelClass: getSlidePanelClass(action),
  };
}

export function SlidePanel({ children, action, className = "", zIndex = 40 }) {
  return (
    <section
      className={`absolute inset-0 flex min-h-full w-full flex-col overflow-y-auto bg-white shadow-2xl ${getSlidePanelClass(action)} ${className}`}
      style={{ zIndex }}
    >
      {children}
    </section>
  );
}
