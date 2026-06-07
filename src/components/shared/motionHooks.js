import { useCallback, useEffect, useRef, useState } from "react";

const AUTO_COLLAPSE_DELAY_MS = 5000;

export function useAutoCollapseCard({ delay = AUTO_COLLAPSE_DELAY_MS, enabled = true, resetKey = "" } = {}) {
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    if (!enabled) {
      setCollapsed(false);
      return;
    }

    setCollapsed(false);
  }, [enabled, resetKey]);

  useEffect(() => {
    if (!enabled || collapsed) return undefined;

    const timer = window.setTimeout(() => {
      setCollapsed(true);
    }, delay);

    return () => window.clearTimeout(timer);
  }, [collapsed, delay, enabled, resetKey]);

  const expand = useCallback(() => setCollapsed(false), []);
  const collapse = useCallback(() => setCollapsed(true), []);
  const toggle = useCallback(() => setCollapsed((current) => !current), []);

  return { collapse, collapsed, expand, setCollapsed, toggle };
}

export function useDirectionalStep(step) {
  const previousStepRef = useRef(step);
  const [direction, setDirection] = useState("forward");

  useEffect(() => {
    const previousStep = previousStepRef.current;
    if (step === previousStep) return;

    setDirection(step > previousStep ? "forward" : "backward");
    previousStepRef.current = step;
  }, [step]);

  return direction;
}
