import { useEffect, useState } from "react";

import supabase from "../lib/supabaseClient";

import {
  accountTypeOfUser,
  canRegisterBusinesses,
  normalizeAccountType,
  personalSwitchBlocked,
} from "./accountTypeRules";

// Account type chosen at onboarding (Settings can change it). Rules live in
// accountTypeRules.js.
export { ACCOUNT_TYPES, accountTypeOfUser, canRegisterBusinesses, normalizeAccountType } from "./accountTypeRules";
export const ACCOUNT_TYPE_CHANGED_EVENT = "kunthai-account-type-changed";
export const HAS_BUSINESS_ACCOUNTS_CODE = "has_business_accounts";

let memory = { userId: "", accountType: "", loaded: false };

function remember(user) {
  memory = { userId: user?.id || "", accountType: user ? accountTypeOfUser(user) : "personal", loaded: true };
  return memory;
}

/**
 * The signed-in account's type, kept live: a Settings change (or an update on
 * another tab reaching this one through the auth listener) re-renders every
 * consumer. `loading` is true only until the first session read.
 */
export function useAccountType() {
  const [state, setState] = useState(() => (memory.loaded ? memory : { ...memory, accountType: "personal" }));

  useEffect(() => {
    let alive = true;
    supabase.auth.getSession()
      .then(({ data }) => {
        if (alive) setState(remember(data?.session?.user || null));
      })
      .catch(() => {
        if (alive) setState((current) => ({ ...current, loaded: true }));
      });

    // Synchronous callback: supabase-js holds its auth lock while notifying.
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (alive) setState(remember(session?.user || null));
    });
    const handleLocalChange = (event) => {
      const accountType = normalizeAccountType(event?.detail?.accountType);
      memory = { ...memory, accountType, loaded: true };
      if (alive) setState(memory);
    };
    window.addEventListener(ACCOUNT_TYPE_CHANGED_EVENT, handleLocalChange);

    return () => {
      alive = false;
      listener?.subscription?.unsubscribe?.();
      window.removeEventListener(ACCOUNT_TYPE_CHANGED_EVENT, handleLocalChange);
    };
  }, []);

  return {
    accountType: state.accountType || "personal",
    loading: !state.loaded,
    canRegister: canRegisterBusinesses(state.accountType),
  };
}

async function hasRows(query) {
  const { count, error } = await query;
  if (error) {
    // A table that is not deployed cannot hold an account.
    if (/does not exist|schema cache/i.test(error.message || "")) return false;
    throw error;
  }
  return Number(count || 0) > 0;
}

/** UrMall businesses, UrRide operator profiles and fleet companies this person owns. */
export async function findOwnedBusinessAccounts(userId) {
  if (!userId) return { urmall: false, urride: false };
  const head = { count: "exact", head: true };
  const [urmall, operator, company] = await Promise.all([
    hasRows(supabase.from("marketplace_businesses").select("id", head).eq("user_id", userId)),
    hasRows(supabase.from("transport_operators").select("id", head).eq("user_id", userId)),
    hasRows(supabase.from("transport_companies").select("id", head).eq("owner_user_id", userId)),
  ]);
  return { urmall, urride: operator || company };
}

/**
 * Saves the account type. Switching to Personal is refused while the person
 * still owns a UrMall business or UrRide operator/company account; the error
 * carries HAS_BUSINESS_ACCOUNTS_CODE and which of the two remain.
 */
export async function saveAccountType(nextType) {
  const accountType = normalizeAccountType(nextType);
  const { data: sessionData } = await supabase.auth.getSession();
  const userId = sessionData?.session?.user?.id || "";
  if (!userId) throw new Error("Sign in to continue.");

  if (accountType === "personal") {
    const owned = await findOwnedBusinessAccounts(userId);
    if (personalSwitchBlocked(owned)) {
      const error = new Error("Delete your UrMall and UrRide business accounts before switching to Personal.");
      error.code = HAS_BUSINESS_ACCOUNTS_CODE;
      error.owned = owned;
      throw error;
    }
  }

  const { error } = await supabase.auth.updateUser({ data: { account_type: accountType } });
  if (error) throw error;

  memory = { userId, accountType, loaded: true };
  window.dispatchEvent(new CustomEvent(ACCOUNT_TYPE_CHANGED_EVENT, { detail: { accountType } }));
  return accountType;
}
