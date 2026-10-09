import { useEffect, useRef, useState } from "react";

import {
  attachRegistrationViewer,
  clearRegistrationTask,
  getAdoptableRegistrationTask,
  getRegistrationTask,
  subscribeRegistrationTasks,
} from "../services/registration/registrationTaskRunner";

// Watches the background save of one registration kind from its screen.
//
// While mounted (and enabled) the screen counts as "watching": a save that
// settles now is the screen's to show (onSettled), exactly as before. Once the
// screen is gone the save carries on and the background host reports it.
//
// `adopted` is the task found when the screen opened: one still saving (show
// the saving state, never a second submit) or one that failed while the user
// was elsewhere (its entered details and picked files come back).
export function useRegistrationTask(kind, { enabled = true, onSettled } = {}) {
  const [adopted] = useState(() => (enabled ? getAdoptableRegistrationTask(kind) : null));
  const [task, setTask] = useState(adopted);
  const onSettledRef = useRef(onSettled);
  onSettledRef.current = onSettled;

  useEffect(() => {
    if (!enabled) return undefined;
    const detach = attachRegistrationViewer(kind);

    const deliver = (settled) => {
      clearRegistrationTask(kind, settled.id);
      onSettledRef.current?.(settled);
    };

    const unsubscribe = subscribeRegistrationTasks((next, change) => {
      if (next.kind !== kind) return;
      if (change === "settled") {
        setTask(null);
        if (next.handledBy === "screen") deliver(next);
        return;
      }
      setTask(next);
    });

    // A failure picked up on opening has been handed to the screen: it is
    // no longer waiting for anyone.
    if (adopted && adopted.status === "failed") clearRegistrationTask(kind, adopted.id);

    // Catch a save that settled between the first render and this effect.
    const current = getRegistrationTask(kind);
    if (current?.status === "running") setTask(current);
    else setTask(null);

    return () => {
      unsubscribe();
      detach();
    };
    // `adopted` is fixed for the screen's lifetime.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, enabled]);

  const running = task?.status === "running";
  return {
    adopted,
    task,
    running,
    progress: running ? task.progress : null,
  };
}
