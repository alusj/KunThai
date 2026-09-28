// backend/services/authService.js
// Handles authentication using Phone + Password + OTP

import supabase from "../lib/supabaseClient";
import {
  checkKunThaiIdentityAvailability,
  normalizeEmailForIdentity,
} from "./accountIdentityService";
import { getStoredVisibilityInviteCode } from "./visibilityCreditService";

const DEFAULT_ONBOARDING_METADATA = {
  primary_surface: "explore",
  onboarding_complete: false,
  onboarding_step: 1,
};

const getEmailAccountMessage = (error) => {
  const message = error?.message?.toLowerCase() || "";

  if (
    message.includes("already registered") ||
    message.includes("already exists") ||
    message.includes("database error saving new user")
  ) {
    return "We could not create an account with these details. Sign in or try another number.";
  }

  return error?.message || "Unable to continue with this account.";
};

// STEP 1: Register user (Supabase sends OTP automatically)
export const signUpWithPhone = async (phone, password, country = "") => {
  try {
    const identity = await checkKunThaiIdentityAvailability({ phone, country });
    const { data, error } = await supabase.auth.signUp({
      phone: identity.normalizedPhone,
      password,
      options: {
        data: {
          ...DEFAULT_ONBOARDING_METADATA,
          phone_number: identity.normalizedPhone,
          country: typeof country === "object" ? country.name : country,
          country_code: typeof country === "object" ? country.iso2 : "",
          account_type: "personal",
          registration_method: "phone",
          // Carried in auth metadata so the backend can credit the inviter on
          // verification even when this browser's storage is gone by then.
          visibility_invite_code: getStoredVisibilityInviteCode() || undefined,
        },
      },
    });

    if (error) {
      try {
        await checkKunThaiIdentityAvailability({ phone: identity.normalizedPhone, country });
      } catch (identityCheckError) {
        return { data, error: identityCheckError };
      }
    }

    return { data, error };
  } catch (error) {
    return { data: null, error };
  }
};

// Server-side attempt limit (otp-delivery/check) before Supabase verifies the
// code. Returns an error to stop, or null to continue with verifyOtp. If the
// check itself can't be reached, Supabase Auth still verifies the code.
const precheckPhoneOtp = async (phone, token) => {
  if (!WHATSAPP_OTP_ENABLED) return null;
  try {
    const { error } = await supabase.functions.invoke("otp-delivery/check", {
      body: { phone, token },
    });
    if (!error) return null;
    const response = error.context;
    const body =
      response && typeof response.json === "function"
        ? await response.json().catch(() => ({}))
        : {};
    if (body.reason === "locked") {
      return {
        name: "AuthApiError",
        status: 429,
        code: "otp_attempts_exceeded",
        message: "Too many incorrect attempts. Please request a new code.",
      };
    }
    if (body.reason === "wrong_code") {
      const left = Number(body.attemptsLeft || 0);
      return {
        name: "AuthApiError",
        status: 400,
        code: "otp_invalid",
        message: `Incorrect code. ${left} attempt${left === 1 ? "" : "s"} left.`,
      };
    }
    return null;
  } catch {
    return null;
  }
};

export const verifyPhoneOtp = async (phone, token) => {
  const blocked = await precheckPhoneOtp(phone, token);
  if (blocked) return { data: { user: null, session: null }, error: blocked };

  const { data, error } = await supabase.auth.verifyOtp({
    phone,
    token,
    type: "sms",
  });

  if (!error && data?.user) {
    const metadata = data.user.user_metadata || {};
    supabase.auth.updateUser({
      data: {
        ...DEFAULT_ONBOARDING_METADATA,
        account_type: metadata.account_type || "personal",
        country: metadata.country || "",
        country_code: metadata.country_code || "",
        phone_number: metadata.phone_number || phone,
        registration_method: metadata.registration_method || "phone",
        phone_verified_by_provider: true,
        primary_surface: metadata.primary_surface || DEFAULT_ONBOARDING_METADATA.primary_surface,
        onboarding_complete: Boolean(metadata.onboarding_complete),
        onboarding_step: Number(metadata.onboarding_step || DEFAULT_ONBOARDING_METADATA.onboarding_step),
      },
    }).catch(() => {});
  }

  return { data, error };
};

export const resendPhoneOtp = async (phone) => {
  const { data, error } = await supabase.auth.resend({
    phone,
    type: "sms",
  });

  return { data, error };
};

export const signUpWithEmailAccount = async (email, phone, password, redirectTo, country = "") => {
  try {
    const identity = await checkKunThaiIdentityAvailability({ email, phone, country });
    const { data, error } = await supabase.auth.signUp({
      email: identity.normalizedEmail,
      password,
      options: {
        emailRedirectTo: redirectTo,
        data: {
          ...DEFAULT_ONBOARDING_METADATA,
          contact_email: identity.normalizedEmail,
          phone_number: identity.normalizedPhone,
          country: typeof country === "object" ? country.name : country,
          country_code: typeof country === "object" ? country.iso2 : "",
          account_type: "email",
          registration_method: "email",
          visibility_invite_code: getStoredVisibilityInviteCode() || undefined,
        },
      },
    });

    if (error) {
      try {
        await checkKunThaiIdentityAvailability({
          email: identity.normalizedEmail,
          phone: identity.normalizedPhone,
          country,
        });
      } catch (identityCheckError) {
        return { data, error: identityCheckError };
      }

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
          message: "We could not create an account with these details. Sign in or try another number.",
        },
      };
    }

    return { data, error: null };
  } catch (error) {
    return { data: null, error };
  }
};

export const signInWithEmailAccount = async (email, password) => {
  const { data, error } = await supabase.auth.signInWithPassword({
    email: normalizeEmailForIdentity(email),
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

// Password recovery for phone accounts: verify ownership with an SMS OTP, then
// set a new password on the recovered session.
export const requestPhonePasswordRecoveryOtp = async (phone) => {
  return await supabase.auth.signInWithOtp({
    phone,
    options: { shouldCreateUser: false },
  });
};

export const verifyPhoneRecoveryOtp = async (phone, token) => {
  const blocked = await precheckPhoneOtp(phone, token);
  if (blocked) return { data: { user: null, session: null }, error: blocked };

  return await supabase.auth.verifyOtp({
    phone,
    token,
    type: "sms",
  });
};

// On only once the otp-delivery function and the Supabase Send SMS Hook are
// live (docs/2026-09-26-whatsapp-otp-setup.md). Until then codes come from
// Twilio as before, and the WhatsApp wording and "Send by SMS" stay hidden.
export const WHATSAPP_OTP_ENABLED = import.meta.env?.VITE_WHATSAPP_OTP_ENABLED === "true";

// Phone codes go out on WhatsApp first (otp-delivery Edge Function). This asks
// it to send the SAME code by SMS now, for someone who has no WhatsApp at hand.
// It works once per code; the function answers the same way either way, so
// the result carries no information and errors are not surfaced.
export const requestOtpBySms = async (phone) => {
  try {
    await supabase.functions.invoke("otp-delivery/fallback", { body: { phone } });
  } catch {
    // The person can still use "Resend OTP".
  }
};

export const updateAccountPassword = async (password) => {
  return await supabase.auth.updateUser({ password });
};

// Logout: ends only this device's session. Other signed-in devices stay active.
export const signOutUser = async () => {
  return await supabase.auth.signOut({ scope: "local" });
};

// Ends the session on every device where this account is signed in.
export const signOutAllDevices = async () => {
  return await supabase.auth.signOut({ scope: "global" });
};

// Get current logged in user
export const getCurrentUser = async () => {
  return await supabase.auth.getUser();
};
