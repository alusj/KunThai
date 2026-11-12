import supabase from "../lib/supabaseClient";

// Nobody books, orders from or messages themselves: an operator cannot book
// their own fleet (or one of a company they own), and a business owner cannot
// order from, book or message their own business as a customer. The database
// refuses these too (KT_SELF_BOOKING / KT_SELF_ORDER / KT_SELF_MESSAGE,
// 20261112110500_no_self_booking_or_order.sql); these checks stop the action
// first with a clear message. When a check cannot run (offline), the action
// goes on and the database still decides.

export const SELF_BOOKING_CODE = "KT_SELF_BOOKING";
export const SELF_ORDER_CODE = "KT_SELF_ORDER";
export const SELF_MESSAGE_CODE = "KT_SELF_MESSAGE";

const MESSAGES = {
  [SELF_BOOKING_CODE]: "You cannot book your own fleet.",
  [SELF_ORDER_CODE]: "You cannot order from your own business.",
  [SELF_MESSAGE_CODE]: "You cannot message your own business.",
};

function selfActionError(code) {
  const error = new Error(MESSAGES[code]);
  error.code = code;
  return error;
}

// A refusal from the database becomes the same friendly error.
export function toSelfActionError(error) {
  const text = String(error?.message || error?.details || "");
  const code = Object.keys(MESSAGES).find((key) => error?.code === key || text.includes(key));
  return code ? selfActionError(code) : error;
}

export async function assertNotOwnBusiness(businessId, userId, code = SELF_ORDER_CODE) {
  if (!businessId || !userId) return;
  try {
    const { data, error } = await supabase
      .from("marketplace_businesses")
      .select("id")
      .eq("id", businessId)
      .eq("user_id", userId)
      .limit(1);
    if (!error && data?.length) throw selfActionError(code);
  } catch (error) {
    if (error?.code === code) throw error;
  }
}

export async function assertNotOwnFleets(fleetIds, userId) {
  const ids = [...new Set((fleetIds || []).filter(Boolean))];
  if (!ids.length || !userId) return;
  let owned = false;
  try {
    const [operators, companies] = await Promise.all([
      supabase.from("transport_operators").select("id").eq("user_id", userId),
      supabase.from("transport_companies").select("id").eq("owner_user_id", userId),
    ]);
    const operatorIds = (operators.data || []).map((row) => row.id);
    const companyIds = (companies.data || []).map((row) => row.id);
    if (!operatorIds.length && !companyIds.length) return;
    const { data, error } = await supabase
      .from("transport_fleets")
      .select("id, operator_id, company_id")
      .in("id", ids);
    if (error) return;
    owned = (data || []).some((fleet) => operatorIds.includes(fleet.operator_id) || (fleet.company_id && companyIds.includes(fleet.company_id)));
  } catch {
    return;
  }
  if (owned) throw selfActionError(SELF_BOOKING_CODE);
}
