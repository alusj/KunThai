import { useCallback, useEffect, useState } from "react";

import { t } from "../../../i18n";
import { loadCountryRegions } from "../../../Backend/services/regions/regionService";
import { isConnectionFailure } from "../../../Backend/services/friendlyErrorService";
import { announceConnectionTrouble, whenOnline } from "../../../Backend/services/networkService";

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
    let cancelRetry = () => {};
    loadCountryRegions(country, { force: attempt > 0 })
      .then((index) => alive && setState({ status: "ready", index, error: "" }))
      .catch((error) => {
        if (!alive) return;
        // Offline is not a broken list: stay in the loading state (the global
        // network toast explains the wait) and load again once reconnected.
        if (isConnectionFailure(error) && announceConnectionTrouble()) {
          cancelRetry = whenOnline(() => setAttempt((value) => value + 1));
          return;
        }
        setState({ status: "error", index: null, error: error?.message || "error" });
      });
    return () => {
      alive = false;
      cancelRetry();
    };
  }, [country, attempt]);

  const reload = useCallback(() => setAttempt((value) => value + 1), []);
  return { ...state, reload };
}
