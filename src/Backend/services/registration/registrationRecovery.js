// After a reload or the app being closed mid-save: did the registration reach
// the server? Answers honestly from the account's own rows — never resubmits.
//
//   "completed"  the business / operator fleet / company with its vehicles exists
//   "partial"    the account row exists but its last part never arrived
//                (UrMall: payout settings; Fleet HQ: vehicles)
//   "unfinished" nothing usable was written; the draft can be submitted again
//
// Throws when the server cannot be asked (offline); the record is kept and
// checked again later.

import supabase from "../../lib/supabaseClient";
import { CLOCK_SKEW_MS, REGISTRATION_KINDS, recordCompleted } from "./registrationTaskCore.js";

function sinceIso(record) {
  return new Date(Number(record.startedAt) - CLOCK_SKEW_MS).toISOString();
}

async function checkUrMall(record) {
  const { data: businesses, error } = await supabase
    .from("marketplace_businesses")
    .select("id, created_at")
    .eq("user_id", record.userId)
    .gte("created_at", sinceIso(record));
  if (error) throw error;
  const created = (businesses || []).filter((row) => recordCompleted(record, [{ created_at: row.created_at }]));
  if (!created.length) return { outcome: "unfinished" };

  const ids = created.map((row) => row.id);
  const { data: payouts, error: payoutError } = await supabase
    .from("marketplace_payout_methods")
    .select("business_id")
    .in("business_id", ids);
  if (payoutError) throw payoutError;
  const finished = created.find((row) => (payouts || []).some((payout) => payout.business_id === row.id));
  return finished ? { outcome: "completed", id: finished.id } : { outcome: "partial", id: created[0].id };
}

async function checkSoloOperator(record) {
  const { data: operator, error } = await supabase
    .from("transport_operators")
    .select("id")
    .eq("user_id", record.userId)
    .maybeSingle();
  if (error) throw error;
  if (!operator?.id) return { outcome: "unfinished" };

  // The fleet is written last; the operator row alone can simply be
  // submitted again (it is updated, not duplicated).
  const { data: fleets, error: fleetError } = await supabase
    .from("transport_fleets")
    .select("id, created_at, updated_at")
    .eq("operator_id", operator.id);
  if (fleetError) throw fleetError;
  return recordCompleted(record, fleets) ? { outcome: "completed", id: operator.id } : { outcome: "unfinished" };
}

async function checkCompany(record) {
  const { data: companies, error } = await supabase
    .from("transport_companies")
    .select("id, created_at, updated_at")
    .eq("owner_user_id", record.userId);
  if (error) throw error;
  const touched = (companies || []).filter((row) => recordCompleted(record, [row]));
  if (!touched.length) return { outcome: "unfinished" };

  const ids = touched.map((row) => row.id);
  const { data: fleets, error: fleetError } = await supabase
    .from("transport_company_fleets")
    .select("company_id")
    .in("company_id", ids);
  if (fleetError) throw fleetError;
  const finished = touched.find((row) => (fleets || []).some((fleet) => fleet.company_id === row.id));
  return finished ? { outcome: "completed", id: finished.id } : { outcome: "partial", id: touched[0].id };
}

export async function checkInterruptedRegistration(record) {
  if (!record?.userId) return { outcome: "unfinished" };
  if (record.kind === REGISTRATION_KINDS.URMALL) return checkUrMall(record);
  if (record.kind === REGISTRATION_KINDS.URRIDE_SOLO) return checkSoloOperator(record);
  if (record.kind === REGISTRATION_KINDS.URRIDE_COMPANY) return checkCompany(record);
  return { outcome: "unfinished" };
}
