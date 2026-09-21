import { useCallback, useEffect, useRef, useState } from "react";

import { isAiCancellation, isRetryableAiError } from "../services/ai/aiService";
import { isConnectionFailure } from "../services/friendlyErrorService";
import { announceConnectionTrouble } from "../services/networkService";
import { runSmartExploreSearch } from "../services/ai/exploreAi";

// KAI — natural-language Explore search state.
//
// Runs only when the person presses "Search with KAI"; typing never
// triggers a model call. Results are always real Explore posts, people and
// hashtags from Explore's own search service.

const IDLE = {
  status: "idle",
  query: "",
  intent: null,
  topicNames: [],
  usedInterests: false,
  results: [],
  error: null,
};

export function useExploreAiSearch() {
  const [state, setState] = useState(IDLE);
  const controllerRef = useRef(null);

  useEffect(() => () => controllerRef.current?.abort(), []);

  const run = useCallback(async (query) => {
    const value = String(query || "").trim();
    if (!value) return;

    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setState({ ...IDLE, status: "loading", query: value });

    try {
      const outcome = await runSmartExploreSearch(value, { signal: controller.signal });
      if (controller.signal.aborted) return;
      setState({ ...IDLE, status: "done", query: value, ...outcome });
    } catch (error) {
      if (controller.signal.aborted || isAiCancellation(error)) return;
      // Offline: back to ready with the query kept, so pressing again retries.
      // The global network toast says why; no error card of its own.
      if (isConnectionFailure(error) && announceConnectionTrouble()) {
        setState({ ...IDLE, query: value });
        return;
      }
      setState({
        ...IDLE,
        status: "error",
        query: value,
        error: {
          message: error?.message || "KAI search is not available right now.",
          retryable: isRetryableAiError(error),
        },
      });
    } finally {
      if (controllerRef.current === controller) controllerRef.current = null;
    }
  }, []);

  const stop = useCallback(() => {
    controllerRef.current?.abort();
    controllerRef.current = null;
    setState(IDLE);
  }, []);

  const reset = stop;

  return { ...state, run, stop, reset };
}
