import { useCallback, useMemo, useState } from "react";

import {
  createNavigationStack,
  currentNavigationEntry,
  popNavigationEntry,
  pushNavigationEntry,
  replaceNavigationEntry,
  resetNavigationStack,
} from "../services/navigationStack";

export function useNavigationStack(initialEntry = "dashboard") {
  const [entries, setEntries] = useState(() => createNavigationStack(initialEntry));
  const current = currentNavigationEntry(entries, initialEntry);

  const push = useCallback((entry) => {
    setEntries((stack) => pushNavigationEntry(stack, entry));
  }, []);

  const replace = useCallback((entry) => {
    setEntries((stack) => replaceNavigationEntry(stack, entry));
  }, []);

  const pop = useCallback(() => {
    setEntries((stack) => popNavigationEntry(stack));
  }, []);

  const reset = useCallback((entry = initialEntry) => {
    setEntries(resetNavigationStack(entry));
  }, [initialEntry]);

  return useMemo(() => ({
    canPop: entries.length > 1,
    current,
    entries,
    pop,
    push,
    replace,
    reset,
  }), [current, entries, pop, push, replace, reset]);
}
