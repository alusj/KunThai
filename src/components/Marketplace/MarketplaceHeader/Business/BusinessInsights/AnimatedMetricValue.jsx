import { useEffect, useMemo, useRef, useState } from "react";

function splitValue(value) {
  if (typeof value === "number") {
    return { number: Number.isFinite(value) ? value : 0, prefix: "", suffix: "", decimals: Number.isInteger(value) ? 0 : 1 };
  }

  const text = String(value ?? "0");
  const match = text.match(/^(.*?)(-?\d[\d,]*(?:\.\d+)?)(.*?)$/);
  if (!match) return { number: null, prefix: text, suffix: "", decimals: 0 };

  const numericText = match[2].replaceAll(",", "");
  const parsed = Number(numericText);
  return {
    number: Number.isFinite(parsed) ? parsed : 0,
    prefix: match[1],
    suffix: match[3],
    decimals: Math.min(2, numericText.split(".")[1]?.length || 0),
  };
}

function useAnimatedNumber(target, duration) {
  const [current, setCurrent] = useState(0);
  const frameRef = useRef(null);

  useEffect(() => {
    if (target === null) return undefined;
    const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reducedMotion) {
      setCurrent(target);
      return undefined;
    }

    const startedAt = performance.now();
    setCurrent(0);

    function tick(now) {
      const progress = Math.min(1, (now - startedAt) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      setCurrent(target * eased);
      if (progress < 1) frameRef.current = window.requestAnimationFrame(tick);
    }

    frameRef.current = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frameRef.current);
  }, [duration, target]);

  return current;
}

export default function AnimatedMetricValue({ className = "", duration = 900, value }) {
  const parts = useMemo(() => splitValue(value), [value]);
  const current = useAnimatedNumber(parts.number, duration);

  if (parts.number === null) return <span className={className}>{parts.prefix}</span>;

  const formatted = current.toLocaleString(undefined, {
    minimumFractionDigits: parts.decimals,
    maximumFractionDigits: parts.decimals,
  });

  return (
    <span className={`tabular-nums ${className}`}>
      {parts.prefix}{formatted}{parts.suffix}
    </span>
  );
}
