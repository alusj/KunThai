import { useEffect, useMemo, useRef, useState } from "react";

import supabase from "./Backend/lib/supabaseClient";
import FlagIcon from "./components/FlagIcon";
import {
  signInWithEmailAccount,
  signInWithPhone,
  signUpWithEmailAccount,
  signUpWithPhone,
  resendPhoneOtp,
  verifyPhoneOtp,
} from "./Backend/services/authService";
import {
  DEFAULT_WEST_AFRICAN_COUNTRY_CODE,
  WEST_AFRICAN_COUNTRY_CODES,
} from "./data/westAfricanCountryCodes";
import {
  getActiveCountryProfile,
  storeCountryContext,
} from "./data/westAfricanCountryProfiles";
import { consumeSwitchAccountPrefill } from "./Backend/services/sessionService";

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

function AuthInput({ label, ...props }) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-semibold text-slate-700">
        {label}
      </span>
      <input
        {...props}
        className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
      />
    </label>
  );
}

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
        <span className="text-slate-400">v</span>
      </button>

      {open ? (
        <div className="absolute left-0 z-30 mt-2 max-h-48 w-[min(20rem,calc(100vw-4rem))] overflow-y-auto rounded-xl border border-slate-200 bg-white p-1 shadow-xl">
          {WEST_AFRICAN_COUNTRY_CODES.map((item) => (
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
        <div className="w-[8.5rem] shrink-0">
          <CountryPicker country={country} onCountryChange={onCountryChange} compact />
        </div>
        <input
          type="tel"
          inputMode="numeric"
          value={phone}
          onChange={(event) => onPhoneChange(event.target.value)}
          placeholder={country.placeholder}
          className="min-h-12 rounded-xl border border-slate-300 bg-white px-4 text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
          required
        />
      </div>
    </div>
  );
}

function PhoneOrEmailInput({ country, value, onCountryChange, onValueChange }) {
  return (
    <div className="block">
      <span className="mb-2 block text-sm font-semibold text-slate-700">
        Phone / Email Account
      </span>
      <div className="flex gap-2">
        <div className="w-[8.5rem] shrink-0">
          <CountryPicker country={country} onCountryChange={onCountryChange} compact />
        </div>
        <input
          type="text"
          inputMode="email"
          value={value}
          onChange={(event) => onValueChange(event.target.value)}
          placeholder="Phone or email"
          autoComplete="username"
          className="min-h-12 rounded-xl border border-slate-300 bg-white px-4 text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
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

const isEmailValue = (value) => value.includes("@");

const buildPhoneForAuth = (value, country) => {
  const trimmed = value.trim();

  if (trimmed.startsWith("+")) {
    return `+${trimmed.replace(/\D/g, "")}`;
  }

  return `${country.dialCode}${normalizePhoneDigits(trimmed, country)}`;
};

export default function Login() {
  const [mode, setMode] = useState("signin");
  const [signupStep, setSignupStep] = useState("options");
  const [signupMethod, setSignupMethod] = useState("");

  const [email, setEmail] = useState("");
  const [signInAccount, setSignInAccount] = useState("");
  const [selectedCountry, setSelectedCountry] = useState(() => {
    const activeProfile = getActiveCountryProfile();
    return WEST_AFRICAN_COUNTRY_CODES.find((country) => country.iso2 === activeProfile.iso2) || DEFAULT_WEST_AFRICAN_COUNTRY_CODE;
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

  const redirectTo = window.location.origin;
  const isPhoneSignup = mode === "signup" && signupMethod === "Phone";
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
  }

  function switchMode(nextMode) {
    setMode(nextMode);
    setSignupStep("options");
    setSignupMethod("");
    setConfirmPassword("");
    setOtpCode("");
    setPendingPhone("");
    resetMessages();
  }

  async function handleOAuth(provider) {
    try {
      resetMessages();
      setProviderLoading(provider);

      const { error: authError } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo,
        },
      });

      if (authError) {
        throw authError;
      }
    } catch (err) {
      setError(err.message || `Failed to continue with ${provider}.`);
    } finally {
      setProviderLoading("");
    }
  }

  function openSignupDetails(method) {
    resetMessages();
    setSignupMethod(method);
    setSignupStep("details");
    setOtpCode("");
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
    if (!isPhoneSignup) {
      return true;
    }

    return validatePhoneDigits(phoneDigits, selectedCountry);
  }

  async function handleSignInWithPhoneOrEmail(event) {
    event.preventDefault();

    try {
      resetMessages();
      setLoading(true);

      const account = signInAccount.trim();
      const response = isEmailValue(account)
        ? await signInWithEmailAccount(account, password)
        : await signInWithPhone(buildPhoneForAuth(account, selectedCountry), password);

      if (response.error) {
        throw response.error;
      }

      setMessage("Welcome back. You are signed in.");
    } catch (err) {
      setError(err.message || "Unable to sign in.");
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

      const { error: authError } = isPhoneSignup
        ? await signUpWithPhone(`${selectedCountry.dialCode}${phoneDigits}`, password)
        : await signUpWithEmailAccount(email, password, redirectTo);

      if (authError) {
        throw authError;
      }

      if (isPhoneSignup) {
        setPendingPhone(`${selectedCountry.dialCode}${phoneDigits}`);
        setSignupStep("otp");
        setMessage("OTP sent. Please verify your phone number.");
      } else {
        setMessage("Verification sent. Please check your email.");
      }
    } catch (err) {
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

      const { error: authError } = await resendPhoneOtp(pendingPhone);

      if (authError) {
        throw authError;
      }

      setMessage("A new OTP has been sent.");
    } catch (err) {
      setError(err.message || "Unable to resend OTP.");
    } finally {
      setLoading(false);
    }
  }

  const isLoading = providerLoading !== "" || loading;

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 px-4 py-4 sm:py-8">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-8">
        <h1 className="text-center text-3xl font-bold text-slate-900">
          Welcome to KunTai
        </h1>

        {mode === "signin" && (
          <form onSubmit={handleSignInWithPhoneOrEmail} className="mt-8 space-y-4">
            <PhoneOrEmailInput
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
              className="w-full rounded-xl bg-blue-600 py-3 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:opacity-60"
            >
              {loading ? "Logging In..." : "Log in with Phone / Email"}
            </button>

            <div className="space-y-3 pt-2">
              <button
                type="button"
                onClick={() => handleOAuth("google")}
                disabled={isLoading}
                className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
              >
                {providerLoading === "google"
                  ? "Connecting Google..."
                  : "Sign in with Google"}
              </button>

              <button
                type="button"
                onClick={() => handleOAuth("facebook")}
                disabled={isLoading}
                className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
              >
                {providerLoading === "facebook"
                  ? "Connecting Facebook..."
                  : "Sign in with Facebook"}
              </button>

              <button
                type="button"
                onClick={() =>
                  setMessage("KunTaiMoney sign in will be connected next.")
                }
                disabled={isLoading}
                className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
              >
                Sign in with KunTaiMoney
              </button>
            </div>
          </form>
        )}

        {mode === "signup" && signupStep === "options" && (
          <div className="mt-8 space-y-3">
            <button
              type="button"
              onClick={() => handleOAuth("google")}
              disabled={isLoading}
              className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
            >
              {providerLoading === "google"
                ? "Connecting Google..."
                : "Sign up with Google"}
            </button>

            <button
              type="button"
              onClick={() => openSignupDetails("Phone")}
              disabled={isLoading}
              className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
            >
              Sign up with Phone
            </button>

            <button
              type="button"
              onClick={() => openSignupDetails("iCloud")}
              disabled={isLoading}
              className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
            >
              Sign up with iCloud
            </button>
          </div>
        )}

        {mode === "signup" && signupStep === "details" && (
          <form onSubmit={handleCreateAccount} className="mt-8 space-y-4">
            <button
              type="button"
              onClick={() => setSignupStep("options")}
              className="text-sm font-semibold text-slate-500"
            >
              Back
            </button>

            <h2 className="text-center text-xl font-bold text-slate-900">
              Sign up with {signupMethod}
            </h2>

            {isPhoneSignup ? (
              <PhoneInput
                country={selectedCountry}
                phone={phoneNumber}
                onCountryChange={setSelectedCountry}
                onPhoneChange={setPhoneNumber}
              />
            ) : (
              <AuthInput
                label="Email Account"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="Enter email account"
                autoComplete="email"
                required
              />
            )}

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
              className="w-full rounded-xl bg-blue-600 py-3 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:opacity-60"
            >
              {loading ? "Creating Account..." : "Create Account / Verify"}
            </button>
          </form>
        )}

        {mode === "signup" && signupStep === "otp" && (
          <form onSubmit={handleVerifyPhoneOtp} className="mt-8 space-y-4">
            <button
              type="button"
              onClick={() => setSignupStep("details")}
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
        </div>
      </div>
    </div>
  );
}
