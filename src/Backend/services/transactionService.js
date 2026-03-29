// backend/services/transactionService.js
// Handles deposits, withdrawals, transfers

import supabase from "../lib/supabaseClient";

// Create transaction record
export const createTransaction = async (
  userId,
  type,
  amount,
  description
) => {
  const { data, error } = await supabase
    .from("transactions")
    .insert([
      {
        user_id: userId,
        type, // "deposit", "withdraw", "transfer"
        amount,
        description,
      },
    ]);

  return { data, error };
};

// Get user transactions
export const getTransactions = async (userId) => {
  const { data, error } = await supabase
    .from("transactions")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  return { data, error };
};