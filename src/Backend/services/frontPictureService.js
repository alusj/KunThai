// Optional front picture (gate, entrance, house front) attached to a UrMall
// order or a UrRide booking. Stored apart from the order/trip rows (see
// migration 20261106170000_order_booking_front_pictures.sql) and loaded only
// when an order or booking is opened. Readable by whoever can read the order
// or trip; written only by the buyer / passenger who placed it.

import supabase from "../lib/supabaseClient";

const TABLE = "kunthai_front_pictures";
export const FRONT_PICTURE_KINDS = {
  order: "marketplace_order",
  trip: "transport_trip",
  openBooking: "transport_open_booking",
};

const cache = new Map(); // `${kind}:${id}` -> picture data URL ("" = none)
const pending = new Map();

const isPicture = (value) => typeof value === "string" && value.startsWith("data:image/");

// Best effort: the order or booking is already placed, so a picture that
// could not be saved never fails it. Returns true when saved.
export async function saveFrontPicture(kind, refIds, picture) {
  const ids = (Array.isArray(refIds) ? refIds : [refIds]).map((id) => String(id || "")).filter(Boolean);
  if (!isPicture(picture) || !ids.length) return false;
  try {
    const { error } = await supabase
      .from(TABLE)
      .upsert(ids.map((refId) => ({ kind, ref_id: refId, picture })), { onConflict: "kind,ref_id" });
    if (error) throw error;
    ids.forEach((id) => cache.set(`${kind}:${id}`, picture));
    return true;
  } catch (error) {
    console.warn("[KunThai] Front picture not saved", error?.message || error);
    return false;
  }
}

// The picture for one order / trip / open booking, or "" when there is none.
export async function fetchFrontPicture(kind, refId) {
  const id = String(refId || "");
  if (!id) return "";
  const key = `${kind}:${id}`;
  if (cache.has(key)) return cache.get(key);
  if (pending.has(key)) return pending.get(key);
  const request = supabase
    .from(TABLE)
    .select("picture")
    .eq("kind", kind)
    .eq("ref_id", id)
    .maybeSingle()
    .then(({ data, error }) => {
      if (error) return "";
      const picture = isPicture(data?.picture) ? data.picture : "";
      cache.set(key, picture);
      return picture;
    })
    .catch(() => "")
    .finally(() => pending.delete(key));
  pending.set(key, request);
  return request;
}
