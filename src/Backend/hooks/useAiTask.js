import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  AI_ERROR_CODES,
  getAiStatus,
  getCachedAiStatus,
  isAiCancellation,
  isRetryableAiError,
  runAiTask,
  sendAiFeedback,
} from "../services/ai/aiService";
import { isGuestMode } from "../services/guestModeService";
import { isConnectionFailure } from "../services/friendlyErrorService";
import { announceConnectionTrouble } from "../services/networkService";

// KAI — the one hook every AI entry point uses.
//
// Owns the whole interaction contract the product asks for: loading, stop,
// regenerate, retry, a stable result, clear errors, and feedback. Screens stay
// free of fetch logic and can never accidentally ship an AI button that cannot
// be cancelled.

/** Is KAI switched on for this deployment? Resolves once per session. */
export function useAiAvailability() {
  const cached = getCachedAiStatus();
  const [status, setStatus] = useState(cached);

  useEffect(() => {
    if (cached) return undefined;
    let active = true;
    getAiStatus().then((value) => {
      if (active) setStatus(value);
    });
    return () => {
      active = false;
    };
    // `cached` is read once on mount on purpose: the session cache never
    // changes shape underneath a mounted component.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    // Guests browse on an anonymous session the AI endpoint refuses, so AI
    // affordances are hidden for them rather than failing on tap.
    available: Boolean(status?.available) && !isGuestMode(),
    // `checked` separates "AI is off" from "we have not asked yet", so a
    // surface can avoid flashing its AI button on and off.
    checked: Boolean(status),
    tasks: status?.tasks || [],
    limits: status?.limits || {},
  };
}

/**
 * Run KAI tasks from a component.
 *
 * @param {object} options
 * @param {string} options.surface  explore | urmall | urride | admin | global.
 * @param {string} [options.screen]  Short hint for the assistant.
 */
export function useAiTask({ surface = "global", screen = "" } = {}) {
  const [state, setState] = useState({
    loading: false,
    result: null,
    meta: null,
    error: null,
    task: "",
  });
  const [feedback, setFeedback] = useState("");

  const controllerRef = useRef(null);
  const lastRequestRef = useRef(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      // A screen that unmounts mid-generation stops waiting immediately.
      controllerRef.current?.abort();
    };
  }, []);

  const stop = useCallback(() => {
    controllerRef.current?.abort();
    controllerRef.current = null;
    setState((current) => (current.loading ? { ...current, loading: false } : current));
  }, []);

  const reset = useCallback(() => {
    controllerRef.current?.abort();
    controllerRef.current = null;
    lastRequestRef.current = null;
    setFeedback("");
    setState({ loading: false, result: null, meta: null, error: null, task: "" });
  }, []);

  const run = useCallback(
    async ({ task, input = {}, context = {} } = {}) => {
      if (!task) return null;

      // One generation at a time per hook: a second press replaces the first
      // rather than paying for both.
      controllerRef.current?.abort();
      const controller = new AbortController();
      controllerRef.current = controller;

      lastRequestRef.current = { task, input, context };
      setFeedback("");
      setState({ loading: true, result: null, meta: null, error: null, task });

      try {
        const response = await runAiTask({
          task,
          surface,
          input,
          context: { screen, ...context },
          signal: controller.signal,
        });
        if (!mountedRef.current || controller.signal.aborted) return null;
        setState({ loading: false, result: response.result, meta: response.meta, error: null, task });
        return response;
      } catch (error) {
        if (!mountedRef.current || isAiCancellation(error)) return null;
        // Offline: back to ready, so pressing again retries. The global
        // network toast says why; no error card of its own.
        if (isConnectionFailure(error) && announceConnectionTrouble()) {
          setState({ loading: false, result: null, meta: null, error: null, task });
          return null;
        }
        setState({
          loading: false,
          result: null,
          meta: null,
          task,
          error: {
            code: error?.code || AI_ERROR_CODES.serverError,
            message: error?.message || "KAI ran into a problem. Please try again.",
            retryable: isRetryableAiError(error),
            retryAfterSeconds: error?.retryAfterSeconds || 0,
          },
        });
        return null;
      } finally {
        if (controllerRef.current === controller) controllerRef.current = null;
      }
    },
    [surface, screen],
  );

  /** Re-run the last request. Used by both "Regenerate" and "Try again". */
  const regenerate = useCallback(() => {
    const last = lastRequestRef.current;
    return last ? run(last) : null;
  }, [run]);

  const rate = useCallback(
    async (rating) => {
      const usageId = state.meta?.usageId;
      setFeedback(rating);
      if (!usageId) return;
      await sendAiFeedback({ usageId, rating });
    },
    [state.meta],
  );

  return useMemo(
    () => ({
      ...state,
      feedback,
      canRegenerate: Boolean(lastRequestRef.current) && !state.loading,
      run,
      stop,
      reset,
      regenerate,
      rate,
    }),
    [state, feedback, run, stop, reset, regenerate, rate],
  );
}
