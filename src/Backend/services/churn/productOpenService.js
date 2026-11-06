import supabase from "../../lib/supabaseClient";
import { productOpenStorageKey, shouldRecordProductOpen, utcDayKey } from "./productOpenRules";

const inFlight = new Set();

// Records "this user opened this sector today" for churn intelligence.
// At most one call per sector per UTC day per device. It never throws and
// never blocks the screen: a failed call is retried on the next open.
export async function recordProductOpen(product, userId) {
  const today = utcDayKey();
  const key = productOpenStorageKey(userId, product);

  let lastRecordedDay = "";
  try {
    lastRecordedDay = localStorage.getItem(key) || "";
  } catch {
    // Storage may be unavailable (private mode); the server caps repeats anyway.
  }

  if (!shouldRecordProductOpen({ userId, product, lastRecordedDay, today })) return false;
  if (inFlight.has(key)) return false;
  inFlight.add(key);

  try {
    const { error } = await supabase.rpc("touch_product_open", { p_product: product });
    if (error) return false;
    try {
      localStorage.setItem(key, today);
    } catch {
      // See above.
    }
    return true;
  } catch {
    return false;
  } finally {
    inFlight.delete(key);
  }
}
