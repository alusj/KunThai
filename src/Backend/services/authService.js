// backend/services/authService.js
// Handles authentication using Phone + Password + OTP

import supabase from "../lib/supabaseClient";

const getEmailAccountMessage = (error) => {
  const message = error?.message?.toLowerCase() || "";

  if (message.includes("already registered") || message.includes("already exists")) {
    return "This email or iCloud account has already been used. Please sign in instead.";
  }

  return error?.message || "Unable to continue with this account.";
};

// STEP 1: Register user (Supabase sends OTP automatically)
export const signUpWithPhone = async (phone, password) => {
  const { data, error } = await supabase.auth.signUp({
    phone,
    password,
    options: {
      data: {
        phone_number: phone,
        account_type: "personal",
      },
    },
  });

  return { data, error };
};

export const verifyPhoneOtp = async (phone, token) => {
  const { data, error } = await supabase.auth.verifyOtp({
    phone,
    token,
    type: "sms",
  });

  return { data, error };
};

export const resendPhoneOtp = async (phone) => {
  const { data, error } = await supabase.auth.resend({
    phone,
    type: "sms",
  });

  return { data, error };
};

export const signUpWithEmailAccount = async (email, password, redirectTo) => {
  const normalizedEmail = email.trim().toLowerCase();

  const existingSignIn = await supabase.auth.signInWithPassword({
    email: normalizedEmail,
    password,
  });

  if (!existingSignIn.error) {
    await supabase.auth.signOut();

    return {
      data: null,
      error: {
        message: "This email or iCloud account has already been used. Please sign in instead.",
      },
    };
  }

  const { data, error } = await supabase.auth.signUp({
    email: normalizedEmail,
    password,
    options: {
      emailRedirectTo: redirectTo,
      data: {
        account_type: "email",
      },
    },
  });

  if (error) {
    return {
      data,
      error: {
        ...error,
        message: getEmailAccountMessage(error),
      },
    };
  }

  const identities = data?.user?.identities ?? [];

  if (data?.user && identities.length === 0) {
    return {
      data,
      error: {
        message: "This email or iCloud account has already been used. Please sign in instead.",
      },
    };
  }

  return { data, error: null };
};

export const signInWithEmailAccount = async (email, password) => {
  const { data, error } = await supabase.auth.signInWithPassword({
    email: email.trim().toLowerCase(),
    password,
  });

  if (error) {
    return {
      data,
      error: {
        ...error,
        message: "We could not sign in with that email or iCloud account. Check the password, or sign up first if it has not been registered.",
      },
    };
  }

  return { data, error: null };
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
