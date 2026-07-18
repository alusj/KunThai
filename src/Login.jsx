import { forwardRef, useEffect, useMemo, useRef, useState } from "react";
import { FaApple } from "react-icons/fa";
import { FcGoogle } from "react-icons/fc";
import { Eye, ShieldAlert } from "lucide-react";

import supabase from "./Backend/lib/supabaseClient";
import { consumeAuthIntent, enterGuestMode } from "./Backend/services/guestModeService";
import FlagIcon from "./components/FlagIcon";
import {
  requestPhonePasswordRecoveryOtp,
  resendPhoneOtp,
  signInWithPhone,
  signUpWithPhone,
  updateAccountPassword,
  verifyPhoneOtp,
  verifyPhoneRecoveryOtp,
} from "./Backend/services/authService";
import {
  clearOtpRequests,
  formatOtpWaitTime,
  getOtpBlockState,
  registerOtpRequest,
} from "./Backend/services/otpRequestGuardService";
import LastOtpNoticeCard from "./components/auth/LastOtpNoticeCard";
import {
  DEFAULT_GLOBAL_COUNTRY_CODE,
  GLOBAL_COUNTRY_CODES,
} from "./data/globalCountryCodes";
import {
  constrainCountryPhoneInput,
  getActiveCountryProfile,
  storeCountryContext,
} from "./data/globalCountryProfiles";
import {
  clearOAuthFlow,
  consumeSwitchAccountPrefill,
  rememberOAuthFlow,
} from "./Backend/services/sessionService";
import {
  checkKunThaiIdentityAvailability,
  isPhoneAlreadyLinkedError,
  PHONE_ALREADY_LINKED_MESSAGE,
} from "./Backend/services/accountIdentityService";
import FindAccountModal from "./components/auth/FindAccountModal";

function AuthMessage({ tone = "info", children }) {
  const tones = {
    info: "border-sky-200 bg-sky-50 text-sky-700",
    success: "border-emerald-200 bg-emerald-50 text-emerald-700",
    danger: "border-rose-200 bg-rose-50 text-rose-700",
  };

  return (
    <div className={`rounded-xl border px-4 py-3 text-sm ${tones[tone]}`}>
      {children}
    </div>
  );
}

const AuthInput = forwardRef(function AuthInput({ label, ...props }, ref) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-semibold text-slate-700">
        {label}
      </span>
      <input
        {...props}
        ref={ref}
        className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
      />
    </label>
  );
});

function CountryPicker({ country, onCountryChange, compact = false }) {
  const [open, setOpen] = useState(false);
  const pickerRef = useRef(null);

  useEffect(() => {
    function handlePointerDown(event) {
      if (!pickerRef.current?.contains(event.target)) {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("touchstart", handlePointerDown);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("touchstart", handlePointerDown);
    };
  }, []);

  return (
    <div ref={pickerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className={`flex min-h-12 w-full items-center gap-2 rounded-xl border border-slate-300 bg-white px-3 text-left text-sm font-semibold text-slate-900 outline-none transition hover:bg-slate-50 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 ${
          compact ? "justify-center" : ""
        }`}
        aria-label="Choose country"
      >
        <FlagIcon code={country.iso2} className="h-5 w-7 shrink-0 rounded-[4px]" />
        <span className={compact ? "sr-only" : "min-w-0 flex-1 truncate"}>
          {country.iso2} - {country.name}
        </span>
        {compact ? (
          <span className="shrink-0 text-sm font-semibold text-slate-900">
            {country.dialCode}
          </span>
        ) : null}
        <svg
  className={`h-4 w-4 shrink-0 text-slate-500 transition-transform ${open ? "rotate-180" : ""}`}
  viewBox="0 0 20 20"
  fill="currentColor"
  aria-hidden="true"
>
  <path
    fillRule="evenodd"
    d="M5.23 7.21a.75.75 0 011.06.02L10 11.17l3.71-3.94a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
    clipRule="evenodd"
  />
</svg>
      </button>

      {open ? (
        <div className="absolute left-0 z-30 mt-2 max-h-48 w-[min(20rem,calc(100vw-4rem))] overflow-y-auto rounded-xl border border-slate-200 bg-white p-1 shadow-xl">
          {GLOBAL_COUNTRY_CODES.map((item) => (
            <button
              key={item.iso2}
              type="button"
              onClick={() => {
                storeCountryContext(item);
                onCountryChange(item);
                setOpen(false);
              }}
              className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm transition ${
                item.iso2 === country.iso2
                  ? "bg-blue-50 font-semibold text-blue-700"
                  : "text-slate-700 hover:bg-slate-50"
              }`}
            >
              <FlagIcon code={item.iso2} className="h-5 w-7 shrink-0 rounded-[4px]" />
              <span className="min-w-0 flex-1 truncate">
                {item.iso2} - {item.name}
              </span>
              <span className="text-xs font-semibold text-slate-400">
                {item.dialCode}
              </span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function PhoneInput({ country, phone, onCountryChange, onPhoneChange, label = "Phone Number" }) {
  return (
    <div className="block">
      <span className="mb-2 block text-sm font-semibold text-slate-700">
        {label}
      </span>
      <div className="flex gap-2">
        <div className="w-[7.75rem] shrink-0 sm:w-[8.5rem]">
          <CountryPicker country={country} onCountryChange={onCountryChange} compact />
        </div>
        <input
          type="tel"
          inputMode="tel"
          value={phone}
          onChange={(event) => onPhoneChange(constrainCountryPhoneInput(event.target.value, country))}
          placeholder={country.placeholder}
          autoComplete="tel"
          className="min-h-12 min-w-0 flex-1 rounded-xl border border-slate-300 bg-white px-4 text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
          required
        />
      </div>
    </div>
  );
}

function PhoneAccountInput({ country, value, onCountryChange, onValueChange }) {
  return (
    <div className="block">
      <span className="mb-2 block text-sm font-semibold text-slate-700">
        Phone Account
      </span>
      <div className="flex gap-2">
        <div className="w-[7.75rem] shrink-0 sm:w-[8.5rem]">
          <CountryPicker country={country} onCountryChange={onCountryChange} compact />
        </div>
        <input
          type="tel"
          inputMode="tel"
          value={value}
          onChange={(event) => onValueChange(constrainCountryPhoneInput(event.target.value, country))}
          placeholder={country.placeholder}
          autoComplete="tel"
          className="min-h-12 min-w-0 flex-1 rounded-xl border border-slate-300 bg-white px-4 text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
          required
        />
      </div>
    </div>
  );
}

const normalizePhoneDigits = (value, country) => {
  const digits = value.replace(/\D/g, "");

  if (digits.length > country.maxLength && digits.startsWith("0")) {
    return digits.slice(1);
  }

  return digits;
};

const buildPhoneForAuth = (value, country) => {
  const trimmed = value.trim();

  if (trimmed.startsWith("+")) {
    return `+${trimmed.replace(/\D/g, "")}`;
  }

  return `${country.dialCode}${normalizePhoneDigits(trimmed, country)}`;
};

const scrollAuthToTop = () => {
  window.requestAnimationFrame(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  });
};

function AuthDivider() {
  return (
    <div className="flex items-center gap-4 py-2">
      <div className="h-px flex-1 bg-slate-200" />
      <span className="text-xs font-bold uppercase tracking-wide text-slate-400">
        OR
      </span>
      <div className="h-px flex-1 bg-slate-200" />
    </div>
  );
}

function SocialAuthButtons({ providerLoading, isLoading, onOAuth }) {
  return (
    <div className="space-y-3 pt-1">
      <button
        type="button"
        onClick={() => onOAuth("google")}
        disabled={isLoading}
        className="flex min-h-12 w-full items-center justify-center gap-3 rounded-xl border border-slate-300 px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
      >
        <FcGoogle className="h-6 w-6 shrink-0" aria-hidden="true" />
        <span>
          {providerLoading === "google"
            ? "Connecting Google..."
            : "Continue with Google"}
        </span>
      </button>

      <button
        type="button"
        onClick={() => onOAuth("apple")}
        disabled={isLoading}
        className="flex min-h-12 w-full items-center justify-center gap-3 rounded-xl border border-slate-300 px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
      >
        <FaApple className="h-7 w-7 shrink-0 text-black" aria-hidden="true" />
        <span>
          {providerLoading === "apple"
            ? "Connecting Apple..."
            : "Continue with Apple"}
        </span>
      </button>
    </div>
  );
}

function GuestButton({ isLoading, onOpen }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      disabled={isLoading}
      className="flex min-h-12 w-full items-center justify-center gap-3 rounded-xl border border-dashed border-slate-300 px-4 py-3 text-sm font-semibold text-slate-500 transition hover:border-slate-400 hover:bg-slate-50 hover:text-slate-700 disabled:opacity-60"
    >
      <Eye className="h-5 w-5 shrink-0" aria-hidden="true" />
      <span>Visit as guest</span>
    </button>
  );
}

export default function Login() {
  const [mode, setMode] = useState(() => (consumeAuthIntent() === "signup" ? "signup" : "signin"));
  const [signupStep, setSignupStep] = useState("details");
  const [guestPromptOpen, setGuestPromptOpen] = useState(false);
  const [guestEntering, setGuestEntering] = useState(false);

  const [signInAccount, setSignInAccount] = useState("");
  const [selectedCountry, setSelectedCountry] = useState(() => {
    const activeProfile = getActiveCountryProfile();
    return GLOBAL_COUNTRY_CODES.find((country) => country.iso2 === activeProfile.iso2) || DEFAULT_GLOBAL_COUNTRY_CODE;
  });
  const [phoneNumber, setPhoneNumber] = useState("");
  const [pendingPhone, setPendingPhone] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [providerLoading, setProviderLoading] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [phoneConflict, setPhoneConflict] = useState(false);
  const [recoveryOpen, setRecoveryOpen] = useState(false);
  const [recoveryPhone, setRecoveryPhone] = useState("");

  const [failedPhoneAttempts, setFailedPhoneAttempts] = useState({});
  const [forgotAvailable, setForgotAvailable] = useState(false);
  const [recoveryStep, setRecoveryStep] = useState("password");
  const [recoveryActivePhone, setRecoveryActivePhone] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [recoveryOtp, setRecoveryOtp] = useState("");
  const [lastOtpNoticeOpen, setLastOtpNoticeOpen] = useState(false);
  const otpInputRef = useRef(null);

  const redirectTo = window.location.origin;
  const phoneDigits = useMemo(
    () => normalizePhoneDigits(phoneNumber, selectedCountry),
    [phoneNumber, selectedCountry],
  );

  useEffect(() => {
    const prefill = consumeSwitchAccountPrefill();
    if (!prefill?.identifier) return;

    setMode("signin");
    setSignInAccount(prefill.identifier);
    setMessage(`Sign in to continue as ${prefill.displayName || prefill.identifier}.`);
  }, []);

  function resetMessages() {
    setError("");
    setMessage("");
    setPhoneConflict(false);
  }

  function switchMode(nextMode) {
    setMode(nextMode);
    setSignupStep("details");
    setConfirmPassword("");
    setOtpCode("");
    setPendingPhone("");
    setRecoveryOpen(false);
    setRecoveryPhone("");
    setRecoveryStep("password");
    setRecoveryOtp("");
    setNewPassword("");
    setConfirmNewPassword("");
    setLastOtpNoticeOpen(false);
    resetMessages();
    scrollAuthToTop();
  }

  async function handleOAuth(provider, intent = "signin") {
    try {
      resetMessages();
      setProviderLoading(provider);
      rememberOAuthFlow(provider, intent);

      const { error: authError } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo,
          queryParams: provider === "google"
            ? { prompt: intent === "signup" ? "select_account consent" : "select_account" }
            : undefined,
        },
      });

      if (authError) {
        throw authError;
      }
    } catch (err) {
      clearOAuthFlow();
      setError(err.message || `Failed to continue with ${provider}.`);
    } finally {
      setProviderLoading("");
    }
  }

  function validatePhoneDigits(digits, country) {
    if (digits.length < country.minLength || digits.length > country.maxLength) {
      const expected =
        country.minLength === country.maxLength
          ? `${country.minLength} digits`
          : `${country.minLength}-${country.maxLength} digits`;

      setError(`${country.name} phone numbers should use ${expected}.`);
      return false;
    }

    return true;
  }

  function validatePhoneSignup() {
    return validatePhoneDigits(phoneDigits, selectedCountry);
  }

  async function handleSignInWithPhone(event) {
    event.preventDefault();

    const account = signInAccount.trim();
    const authPhone = buildPhoneForAuth(account, selectedCountry);

    try {
      resetMessages();
      setLoading(true);

      if (!validatePhoneDigits(normalizePhoneDigits(account, selectedCountry), selectedCountry)) {
        return;
      }
      const response = await signInWithPhone(authPhone, password);

      if (response.error) {
        throw response.error;
      }

      setFailedPhoneAttempts((current) => ({ ...current, [authPhone]: 0 }));
      setForgotAvailable(false);
      setMessage("Welcome back. You are signed in.");
    } catch (err) {
      setError(err.message || "Unable to sign in.");

      // After more than one wrong password on a phone number that really has a
      // KunThai account, offer OTP-verified password recovery. The signup
      // preflight doubles as the existence check: a registered phone reports
      // the phone_exists conflict.
      const attempts = (failedPhoneAttempts[authPhone] || 0) + 1;
      setFailedPhoneAttempts((current) => ({ ...current, [authPhone]: attempts }));
      if (attempts >= 2 && !forgotAvailable) {
        checkKunThaiIdentityAvailability({ phone: authPhone, country: selectedCountry })
          .then(() => {
            // Phone is free to register, so there is no account to recover.
          })
          .catch((lookupError) => {
            if (isPhoneAlreadyLinkedError(lookupError)) setForgotAvailable(true);
          });
      }
    } finally {
      setLoading(false);
    }
  }

  function beginPasswordRecovery() {
    const authPhone = buildPhoneForAuth(signInAccount.trim(), selectedCountry);
    const blockState = getOtpBlockState(authPhone);
    if (blockState.blocked) {
      setError(`OTP limit reached for this number. You can request a new code in ${formatOtpWaitTime(blockState.blockedUntil)}.`);
      return;
    }

    resetMessages();
    setRecoveryActivePhone(authPhone);
    setRecoveryStep("password");
    setNewPassword("");
    setConfirmNewPassword("");
    setRecoveryOtp("");
    setMode("recovery");
    scrollAuthToTop();
  }

  async function handleRecoveryPasswordSubmit(event) {
    event.preventDefault();

    if (newPassword.length < 6) {
      setError("Choose a new password with at least 6 characters.");
      return;
    }
    if (newPassword !== confirmNewPassword) {
      setError("Passwords do not match.");
      return;
    }

    try {
      resetMessages();
      setLoading(true);

      const guard = registerOtpRequest(recoveryActivePhone);
      const { error: otpError } = await requestPhonePasswordRecoveryOtp(recoveryActivePhone);
      if (otpError) throw otpError;

      setRecoveryStep("otp");
      setMessage(`OTP sent to ${recoveryActivePhone}. Enter the code to confirm it is you.`);
      if (guard.isSecond) setLastOtpNoticeOpen(true);
      scrollAuthToTop();
    } catch (err) {
      setError(err.message || "Unable to send the recovery OTP.");
    } finally {
      setLoading(false);
    }
  }

  async function handleRecoveryOtpVerify(event) {
    event.preventDefault();

    try {
      resetMessages();
      setLoading(true);

      const { error: verifyError } = await verifyPhoneRecoveryOtp(recoveryActivePhone, recoveryOtp.trim());
      if (verifyError) throw verifyError;

      clearOtpRequests(recoveryActivePhone);
      const { error: passwordError } = await updateAccountPassword(newPassword);
      if (passwordError) {
        setError("You are signed in, but the new password could not be saved. Set it again from account settings.");
        return;
      }

      setMessage("Password updated. You are signed in.");
    } catch (err) {
      setError(err.message || "Unable to verify this OTP.");
    } finally {
      setLoading(false);
    }
  }

  async function handleRecoveryResendOtp() {
    try {
      resetMessages();
      setLoading(true);

      const guard = registerOtpRequest(recoveryActivePhone);
      const { error: otpError } = await requestPhonePasswordRecoveryOtp(recoveryActivePhone);
      if (otpError) throw otpError;

      setMessage("A new OTP has been sent.");
      if (guard.isSecond) setLastOtpNoticeOpen(true);
    } catch (err) {
      setError(err.message || "Unable to resend OTP.");
    } finally {
      setLoading(false);
    }
  }

  async function handleCreateAccount(event) {
    event.preventDefault();

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    if (!validatePhoneSignup()) {
      return;
    }

    try {
      resetMessages();
      setLoading(true);

      const signupPhone = buildPhoneForAuth(phoneNumber, selectedCountry);
      const blockState = getOtpBlockState(signupPhone);
      if (blockState.blocked) {
        setError(`OTP limit reached for this number. You can request a new code in ${formatOtpWaitTime(blockState.blockedUntil)}.`);
        return;
      }

      const { error: authError } = await signUpWithPhone(signupPhone, password, selectedCountry);

      if (authError) {
        throw authError;
      }

      const guard = registerOtpRequest(signupPhone);
      setPendingPhone(signupPhone);
      setSignupStep("otp");
      setMessage("OTP sent. Please verify your phone number.");
      if (guard.isSecond) setLastOtpNoticeOpen(true);
      scrollAuthToTop();
    } catch (err) {
      if (isPhoneAlreadyLinkedError(err)) {
        setPhoneConflict(true);
        setRecoveryPhone(buildPhoneForAuth(phoneNumber, selectedCountry));
        setError(PHONE_ALREADY_LINKED_MESSAGE);
        return;
      }

      setError(err.message || "Unable to create your account.");
    } finally {
      setLoading(false);
    }
  }

  async function handleVerifyPhoneOtp(event) {
    event.preventDefault();

    try {
      resetMessages();
      setLoading(true);

      const { error: authError } = await verifyPhoneOtp(pendingPhone, otpCode.trim());

      if (authError) {
        throw authError;
      }

      clearOtpRequests(pendingPhone);
      setMessage("Phone verified. Your onboarding is ready.");
    } catch (err) {
      setError(err.message || "Unable to verify this OTP.");
    } finally {
      setLoading(false);
    }
  }

  async function handleResendPhoneOtp() {
    try {
      resetMessages();
      setLoading(true);

      const guard = registerOtpRequest(pendingPhone);
      const { error: authError } = await resendPhoneOtp(pendingPhone);

      if (authError) {
        throw authError;
      }

      setMessage("A new OTP has been sent.");
      if (guard.isSecond) setLastOtpNoticeOpen(true);
    } catch (err) {
      setError(err.message || "Unable to resend OTP.");
    } finally {
      setLoading(false);
    }
  }

  const isLoading = providerLoading !== "" || loading;

  return (
    <div className="flex min-h-[100dvh] items-start justify-center overflow-y-auto bg-slate-100 px-3 py-3 sm:items-center sm:px-4 sm:py-8">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-8">
        <h1 className="text-center text-3xl font-bold leading-tight text-slate-900">
          Welcome to KunThai
        </h1>

        {mode === "signin" && (
          <form onSubmit={handleSignInWithPhone} className="mt-6 space-y-4 sm:mt-8">
            <PhoneAccountInput
              country={selectedCountry}
              value={signInAccount}
              onCountryChange={setSelectedCountry}
              onValueChange={setSignInAccount}
            />

            <AuthInput
              label="Password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Enter password"
              autoComplete="current-password"
              required
            />

            <button
              type="submit"
              disabled={isLoading}
              className="min-h-12 w-full rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:opacity-60"
            >
              {loading ? "Logging In..." : "Log in with Phone"}
            </button>

            {forgotAvailable ? (
              <button
                type="button"
                onClick={beginPasswordRecovery}
                disabled={isLoading}
                className="min-h-12 w-full rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800 transition hover:bg-amber-100 disabled:opacity-60"
              >
                Forgot password? Verify with OTP
              </button>
            ) : null}

            <AuthDivider />

            <SocialAuthButtons
              providerLoading={providerLoading}
              isLoading={isLoading}
              onOAuth={(provider) => handleOAuth(provider, "signin")}
            />

            <GuestButton isLoading={isLoading} onOpen={() => setGuestPromptOpen(true)} />
          </form>
        )}

        {mode === "signup" && signupStep === "details" && (
          <form onSubmit={handleCreateAccount} className="mt-6 space-y-4 sm:mt-8">
            <PhoneInput
              country={selectedCountry}
              phone={phoneNumber}
              onCountryChange={setSelectedCountry}
              onPhoneChange={setPhoneNumber}
              label="Phone Account"
            />

            <AuthInput
              label="Password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Enter password"
              autoComplete="new-password"
              required
            />

            <AuthInput
              label="Confirm Password"
              type="password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              placeholder="Confirm password"
              autoComplete="new-password"
              required
            />

            <button
              type="submit"
              disabled={isLoading}
              className="min-h-12 w-full rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:opacity-60"
            >
              {loading ? "Creating Account..." : "Sign up with Phone"}
            </button>

            <AuthDivider />

            <SocialAuthButtons
              providerLoading={providerLoading}
              isLoading={isLoading}
              onOAuth={(provider) => handleOAuth(provider, "signup")}
            />
          </form>
        )}

        {mode === "signup" && signupStep === "otp" && (
          <form onSubmit={handleVerifyPhoneOtp} className="mt-8 space-y-4">
            <button
              type="button"
              onClick={() => {
                setSignupStep("details");
                scrollAuthToTop();
              }}
              className="text-sm font-semibold text-slate-500"
            >
              Back
            </button>

            <h2 className="text-center text-xl font-bold text-slate-900">
              Verify phone number
            </h2>

            <p className="text-center text-sm text-slate-500">
              Enter the OTP sent to {pendingPhone}.
            </p>

            <AuthInput
              label="OTP Code"
              type="text"
              inputMode="numeric"
              ref={otpInputRef}
              value={otpCode}
              onChange={(event) => setOtpCode(event.target.value.replace(/\D/g, "").slice(0, 8))}
              placeholder="Enter OTP"
              autoComplete="one-time-code"
              required
            />

            <button
              type="submit"
              disabled={isLoading}
              className="w-full rounded-xl bg-blue-600 py-3 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:opacity-60"
            >
              {loading ? "Verifying..." : "Verify Phone"}
            </button>

            <button
              type="button"
              onClick={handleResendPhoneOtp}
              disabled={isLoading}
              className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
            >
              Resend OTP
            </button>
          </form>
        )}

        {mode === "recovery" && recoveryStep === "password" && (
          <form onSubmit={handleRecoveryPasswordSubmit} className="mt-6 space-y-4 sm:mt-8">
            <button
              type="button"
              onClick={() => switchMode("signin")}
              className="text-sm font-semibold text-slate-500"
            >
              Back to sign in
            </button>

            <h2 className="text-center text-xl font-bold text-slate-900">Reset your password</h2>
            <p className="text-center text-sm text-slate-500">
              Choose a new password for {recoveryActivePhone}. KunThai will then send an OTP to confirm this phone belongs to you.
            </p>

            <AuthInput
              label="New password"
              type="password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              placeholder="Enter new password"
              autoComplete="new-password"
              required
            />

            <AuthInput
              label="Confirm new password"
              type="password"
              value={confirmNewPassword}
              onChange={(event) => setConfirmNewPassword(event.target.value)}
              placeholder="Confirm new password"
              autoComplete="new-password"
              required
            />

            <button
              type="submit"
              disabled={isLoading}
              className="min-h-12 w-full rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:opacity-60"
            >
              {loading ? "Sending OTP..." : "Send verification OTP"}
            </button>
          </form>
        )}

        {mode === "recovery" && recoveryStep === "otp" && (
          <form onSubmit={handleRecoveryOtpVerify} className="mt-8 space-y-4">
            <button
              type="button"
              onClick={() => {
                setRecoveryStep("password");
                scrollAuthToTop();
              }}
              className="text-sm font-semibold text-slate-500"
            >
              Back
            </button>

            <h2 className="text-center text-xl font-bold text-slate-900">Confirm it is you</h2>
            <p className="text-center text-sm text-slate-500">
              Enter the OTP sent to {recoveryActivePhone}. Your new password is saved once the code is verified.
            </p>

            <AuthInput
              label="OTP Code"
              type="text"
              inputMode="numeric"
              ref={otpInputRef}
              value={recoveryOtp}
              onChange={(event) => setRecoveryOtp(event.target.value.replace(/\D/g, "").slice(0, 8))}
              placeholder="Enter OTP"
              autoComplete="one-time-code"
              required
            />

            <button
              type="submit"
              disabled={isLoading}
              className="w-full rounded-xl bg-blue-600 py-3 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:opacity-60"
            >
              {loading ? "Verifying..." : "Verify and update password"}
            </button>

            <button
              type="button"
              onClick={handleRecoveryResendOtp}
              disabled={isLoading}
              className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
            >
              Resend OTP
            </button>
          </form>
        )}

        <div className="my-6 grid grid-cols-2 gap-2 rounded-xl bg-slate-100 p-1">
          <button
            type="button"
            onClick={() => switchMode("signin")}
            className={`rounded-lg py-3 text-sm font-semibold transition ${
              mode === "signin"
                ? "bg-white text-slate-900 shadow-sm"
                : "text-slate-500"
            }`}
          >
            Sign In
          </button>

          <button
            type="button"
            onClick={() => switchMode("signup")}
            className={`rounded-lg py-3 text-sm font-semibold transition ${
              mode === "signup"
                ? "bg-white text-slate-900 shadow-sm"
                : "text-slate-500"
            }`}
          >
            Sign Up
          </button>
        </div>

        <div className="space-y-3">
          {message && <AuthMessage tone="success">{message}</AuthMessage>}
          {error && <AuthMessage tone="danger">{error}</AuthMessage>}
          {phoneConflict ? (
            <button
              type="button"
              onClick={() => setRecoveryOpen(true)}
              className="w-full rounded-xl border border-blue-300 bg-blue-50 px-4 py-3 text-sm font-semibold text-blue-700 transition hover:bg-blue-100"
            >
              Find my account
            </button>
          ) : null}
        </div>
      </div>

      <LastOtpNoticeCard
        open={lastOtpNoticeOpen}
        onCancel={() => setLastOtpNoticeOpen(false)}
        onVerify={() => {
          setLastOtpNoticeOpen(false);
          otpInputRef.current?.focus();
        }}
      />

      {recoveryOpen ? (
        <FindAccountModal
          country={selectedCountry}
          phone={recoveryPhone}
          redirectTo={redirectTo}
          onClose={() => setRecoveryOpen(false)}
          onTryAnotherNumber={() => {
            setRecoveryOpen(false);
            setPhoneNumber("");
            setRecoveryPhone("");
            resetMessages();
          }}
        />
      ) : null}

      {guestPromptOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 px-4 py-6 backdrop-blur-sm" role="presentation">
          <section
            role="alertdialog"
            aria-modal="true"
            aria-label="Guest visit notice"
            className="kt-toast-expand-in w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl"
          >
            <span className="grid h-12 w-12 place-items-center rounded-xl bg-amber-50 text-amber-600">
              <ShieldAlert size={24} aria-hidden="true" />
            </span>
            <h2 className="mt-4 text-2xl font-bold text-slate-950">Entering KunThai as a guest</h2>
            <p className="mt-3 text-sm font-semibold leading-6 text-slate-600">
              You can explore posts, UrMall, and UrRide freely, but as a guest you cannot react,
              post, comment, message, shop, or book. No personal data is collected or saved during
              your visit, and your guest session ends automatically when you leave.
            </p>
            <div className="mt-5 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setGuestPromptOpen(false)}
                disabled={guestEntering}
                className="rounded-xl border border-slate-300 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
              >
                Go back
              </button>
              <button
                type="button"
                disabled={guestEntering}
                onClick={async () => {
                  setGuestEntering(true);
                  try {
                    await enterGuestMode();
                  } catch (guestError) {
                    setError(guestError.message || "Unable to start a guest visit.");
                    setGuestPromptOpen(false);
                  } finally {
                    setGuestEntering(false);
                  }
                }}
                className="rounded-xl bg-slate-950 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-60"
              >
                {guestEntering ? "Entering…" : "Enter as guest"}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}
