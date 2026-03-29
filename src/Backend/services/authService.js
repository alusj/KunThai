// backend/services/authService.js
// Handles authentication using Phone + Password + OTP

import supabase from "../lib/supabaseClient";

// STEP 1: Register user (Supabase sends OTP automatically)
export const signUpWithPhone = async (phone, password) => {
  const { data, error } = await supabase.auth.signUp({
    phone,
    password,
  });

  return { data, error };
};

// STEP 2: Login (requires verified phone)
export const signInWithPhone = async (phone, password) => {
  const { data, error } = await supabase.auth.signInWithPassword({
    phone,
    password,
  });

  return { data, error };
};

// Logout
export const signOutUser = async () => {
  return await supabase.auth.signOut();
};

// Get current logged in user
export const getCurrentUser = async () => {
  return await supabase.auth.getUser();
};