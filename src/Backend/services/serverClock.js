import supabase from "../lib/supabaseClient";

// A phone's clock can be wrong (manually set, drifted). Safety rules that
// depend on the time of day use the server's clock instead: the offset is
// measured once and refreshed every 15 minutes, and the device clock is the
// fallback when the server cannot be reached.
const REFRESH_MS = 15 * 60 * 1000;
let offsetMs = 0;
let measuredAt = 0;
let pending = null;

async function measureOffset() {
  const sentAt = Date.now();
  const { data, error } = await supabase.rpc("kunthai_server_now");
  if (error || !data) return;
  const receivedAt = Date.now();
  const serverMs = new Date(data).getTime();
  if (!Number.isFinite(serverMs)) return;
  // Assume the reply took half the round trip to come back.
  offsetMs = serverMs + (receivedAt - sentAt) / 2 - receivedAt;
  measuredAt = receivedAt;
}

// Current time as a Date, corrected to the server clock when possible.
export async function getTrustedNow() {
  if (Date.now() - measuredAt > REFRESH_MS) {
    pending = pending || measureOffset().catch(() => {}).finally(() => { pending = null; });
    await Promise.race([pending, new Promise((resolve) => setTimeout(resolve, 2500))]);
  }
  return new Date(Date.now() + offsetMs);
}
