import { useEffect, useState } from "react";

// Non-component helpers shared by the admin operations UI.

export const TONE_CLASSES = {
  emerald: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  orange: "bg-orange-50 text-orange-800 ring-orange-200",
  amber: "bg-amber-50 text-amber-800 ring-amber-200",
  red: "bg-red-50 text-red-700 ring-red-200",
  sky: "bg-sky-50 text-sky-800 ring-sky-200",
  zinc: "bg-zinc-100 text-zinc-700 ring-zinc-200",
};

export function useDebouncedValue(value, delay = 350) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

export function formatDate(value) {
  if (!value) return "—";
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(value));
}

export function formatDateTimeShort(value) {
  if (!value) return "—";
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

export function titleize(value = "") {
  return String(value || "").replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}
