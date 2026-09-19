import { useCallback, useEffect, useState } from "react";

import { t } from "../../../i18n";
import { loadCountryRegions } from "../../../Backend/services/regions/regionService";

// Translate a database label ("District", "States"…) when a translation exists.
export function regionLabel(label) {
  const text = String(label || "");
  const translated = t(`regions.labels.${text}`);
  return translated === `regions.labels.${text}` ? text : translated;
}

/** Load (and cache) one country's states/districts. */
export function useCountryRegions(country) {
  const [state, setState] = useState({ status: country ? "loading" : "idle", index: null, error: "" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let alive = true;
    if (!country) {
      setState({ status: "idle", index: null, error: "" });
      return undefined;
    }
    setState((current) => ({ ...current, status: "loading", error: "" }));
    loadCountryRegions(country, { force: attempt > 0 })
      .then((index) => alive && setState({ status: "ready", index, error: "" }))
      .catch((error) => alive && setState({ status: "error", index: null, error: error?.message || "error" }));
    return () => {
      alive = false;
    };
  }, [country, attempt]);

  const reload = useCallback(() => setAttempt((value) => value + 1), []);
  return { ...state, reload };
}
