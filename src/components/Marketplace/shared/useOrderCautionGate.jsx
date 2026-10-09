import { useCallback, useEffect, useRef, useState } from "react";

import supabase from "../../../Backend/lib/supabaseClient";
import OrderCautionDialog from "./OrderCautionCard";
import { pendingOrderCautions, setOrderCautionHidden } from "./orderCaution";

const SESSION_WAIT_MS = 1500;

// The signed-in person's id, read from the locally stored session (no network
// call). Signed out — or a session that takes too long to read — falls back to
// the device key, which can only mean a card shows when it might have been
// hidden, never the other way round.
export async function readOrderCautionUserId() {
  try {
    const session = supabase.auth.getSession().then(({ data }) => data?.session?.user?.id || "");
    const timeout = new Promise((resolve) => { window.setTimeout(() => resolve(""), SESSION_WAIT_MS); });
    return await Promise.race([session, timeout]);
  } catch {
    return "";
  }
}

/**
 * Put the order / booking caution card in front of an action.
 *
 *   const { requestCaution, cautionElement } = useOrderCautionGate();
 *   <button onClick={() => requestCaution("restaurant", openOrderForm)}>Order</button>
 *   {cautionElement}
 *
 * `kinds` is one caution kind or a list (a cart can hold a shop's and a
 * supplier's items); each card the person has not hidden is shown in turn.
 * "Continue" on the last one runs `onContinue`; "Cancel" (or Escape, the
 * backdrop, Back) closes the card and runs nothing. If every card is hidden,
 * `onContinue` runs straight away.
 */
export default function useOrderCautionGate() {
  const [request, setRequest] = useState(null);
  const busyRef = useRef(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const requestCaution = useCallback(async (kinds, onContinue) => {
    // A second tap while a card is opening or open does nothing.
    if (busyRef.current) return;
    busyRef.current = true;
    const userId = await readOrderCautionUserId();
    if (!mountedRef.current) {
      busyRef.current = false;
      return;
    }
    const pending = pendingOrderCautions(userId, kinds);
    if (!pending.length) {
      busyRef.current = false;
      onContinue?.();
      return;
    }
    setRequest({ kinds: pending, index: 0, userId, onContinue });
  }, []);

  const handleResolve = useCallback(({ action, dontShowAgain }) => {
    const current = request;
    if (!current) return;
    if (action !== "continue") {
      busyRef.current = false;
      setRequest(null);
      return;
    }
    if (dontShowAgain) setOrderCautionHidden(current.userId, current.kinds[current.index], true);
    if (current.index + 1 < current.kinds.length) {
      setRequest({ ...current, index: current.index + 1 });
      return;
    }
    busyRef.current = false;
    setRequest(null);
    current.onContinue?.();
  }, [request]);

  const kind = request ? request.kinds[request.index] : "";
  const cautionElement = request
    ? <OrderCautionDialog key={`${kind}-${request.index}`} kind={kind} onResolve={handleResolve} />
    : null;

  return { requestCaution, cautionElement, cautionOpen: Boolean(request) };
}
