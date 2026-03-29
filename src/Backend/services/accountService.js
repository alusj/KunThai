// backend/services/accountService.js
// Handles main and sub accounts

import supabase from "../lib/supabaseClient";

// Create Main Account (after registration)
export const createMainAccount = async (userId, currency) => {
  const { data, error } = await supabase
    .from("main_accounts")
    .insert([
      {
        user_id: userId,
        balance: 0.0,
        currency,
      },
    ]);

  return { data, error };
};

// Fetch Main Account
export const getMainAccount = async (userId) => {
  const { data, error } = await supabase
    .from("main_accounts")
    .select("*")
    .eq("user_id", userId)
    .single();

  return { data, error };
};

// Fetch Sub Accounts (only return if they exist)
export const getSubAccounts = async (userId) => {
  const { data, error } = await supabase
    .from("sub_accounts")
    .select("*")
    .eq("user_id", userId);

  return { data, error };
};