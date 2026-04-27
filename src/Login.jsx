import { useState } from "react";

import supabase from "./Backend/lib/supabaseClient";

function AuthMessage({ tone = "info", children }) {
  const tones = {
    info: "border-sky-200 bg-sky-50 text-sky-700",
    success: "border-emerald-200 bg-emerald-50 text-emerald-700",
    danger: "border-rose-200 bg-rose-50 text-rose-700",
  };

  return <div className={`rounded-xl border px-4 py-3 text-sm ${tones[tone]}`}>{children}</div>;
}

function AuthInput({ label, ...props }) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-medium text-slate-700">{label}</span>
      <input
        {...props}
        className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
      />
    </label>
  );
}

export default function Login() {
  const [mode, setMode] = useState("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [providerLoading, setProviderLoading] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const redirectTo = window.location.origin;

  function resetMessages() {
    setError("");
    setMessage("");
  }

  function switchMode(nextMode) {
    setMode(nextMode);
    setOtpSent(false);
    resetMessages();
  }

  async function handleOAuth(provider) {
    try {
      resetMessages();
      setProviderLoading(provider);

      const { error: authError } = await supabase.auth.signInWithOAuth({
        provider,
        options: { redirectTo },
      });

      if (authError) {
        throw authError;
      }
    } catch (err) {
      setError(err.message || `Failed to sign in with ${provider}.`);
    } finally {
      setProviderLoading("");
    }
  }

  async function handleEmailSignIn(event) {
    event.preventDefault();

    try {
      resetMessages();
      setLoading(true);

      const { error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (authError) {
        throw authError;
      }
    } catch (err) {
      setError(err.message || "Unable to sign in.");
    } finally {
      setLoading(false);
    }
  }

  async function handleEmailSignUp(event) {
    event.preventDefault();

    try {
      resetMessages();
      setLoading(true);

      const { error: authError } = await supabase.auth.signUp({
        email,
        password,
      });

      if (authError) {
        throw authError;
      }

      setMessage("Account created successfully.");
    } catch (err) {
      setError(err.message || "Unable to create your account.");
    } finally {
      setLoading(false);
    }
  }

  async function handleSendPhoneOtp(event) {
    event.preventDefault();

    try {
      resetMessages();
      setLoading(true);

      const { error: authError } = await supabase.auth.signInWithOtp({
        phone,
      });

      if (authError) {
        throw authError;
      }

      setOtpSent(true);
      setMessage("OTP sent successfully.");
    } catch (err) {
      setError(err.message || "Unable to send OTP.");
    } finally {
      setLoading(false);
    }
  }

  async function handleVerifyPhoneOtp(event) {
    event.preventDefault();

    try {
      resetMessages();
      setLoading(true);

      const { error: authError } = await supabase.auth.verifyOtp({
        phone,
        token: otp,
        type: "sms",
      });

      if (authError) {
        throw authError;
      }

      setMessage("Phone verified successfully.");
    } catch (err) {
      setError(err.message || "Invalid OTP.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 px-4 py-8">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <h1 className="text-center text-2xl font-semibold text-slate-900">Welcome to KunTai</h1>

        <div className="mt-8 space-y-3">
          <button
            type="button"
            onClick={() => handleOAuth("google")}
            disabled={providerLoading !== ""}
            className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
          >
            {providerLoading === "google" ? "Connecting Google..." : "Sign in with Google"}
          </button>

          <button
            type="button"
            onClick={() => handleOAuth("facebook")}
            disabled={providerLoading !== ""}
            className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
          >
            {providerLoading === "facebook" ? "Connecting Facebook..." : "Sign in with Facebook"}
          </button>

          <button
            type="button"
            className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
          >
            Sign in with KunTaiMoney
          </button>
        </div>

        <div className="my-6 grid grid-cols-3 gap-2 rounded-xl bg-slate-100 p-1">
          <button
            type="button"
            onClick={() => switchMode("signin")}
            className={`rounded-lg py-2 text-sm font-medium transition ${
              mode === "signin" ? "bg-white text-slate-900 shadow-sm" : "text-slate-600"
            }`}
          >
            Sign In
          </button>
          <button
            type="button"
            onClick={() => switchMode("signup")}
            className={`rounded-lg py-2 text-sm font-medium transition ${
              mode === "signup" ? "bg-white text-slate-900 shadow-sm" : "text-slate-600"
            }`}
          >
            Sign Up
          </button>
          <button
            type="button"
            onClick={() => switchMode("phone")}
            className={`rounded-lg py-2 text-sm font-medium transition ${
              mode === "phone" ? "bg-white text-slate-900 shadow-sm" : "text-slate-600"
            }`}
          >
            Phone
          </button>
        </div>

        {mode === "signin" && (
          <form onSubmit={handleEmailSignIn} className="space-y-4">
            <AuthInput
              label="Email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="Enter your email"
              required
            />
            <AuthInput
              label="Password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Enter your password"
              required
            />
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-xl bg-blue-600 py-3 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:opacity-60"
            >
              {loading ? "Signing in..." : "Sign In"}
            </button>
          </form>
        )}

        {mode === "signup" && (
          <form onSubmit={handleEmailSignUp} className="space-y-4">
            <AuthInput
              label="Email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="Enter your email"
              required
            />
            <AuthInput
              label="Password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Create a password"
              required
            />
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-xl bg-blue-600 py-3 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:opacity-60"
            >
              {loading ? "Creating account..." : "Create Account"}
            </button>
          </form>
        )}

        {mode === "phone" && !otpSent && (
          <form onSubmit={handleSendPhoneOtp} className="space-y-4">
            <AuthInput
              label="Phone"
              type="tel"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              placeholder="+232XXXXXXXX"
              required
            />
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-xl bg-blue-600 py-3 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:opacity-60"
            >
              {loading ? "Sending OTP..." : "Send OTP"}
            </button>
          </form>
        )}

        {mode === "phone" && otpSent && (
          <form onSubmit={handleVerifyPhoneOtp} className="space-y-4">
            <AuthInput
              label="OTP"
              type="text"
              value={otp}
              onChange={(event) => setOtp(event.target.value)}
              placeholder="Enter 6-digit code"
              required
            />
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-xl bg-blue-600 py-3 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:opacity-60"
            >
              {loading ? "Verifying..." : "Verify OTP"}
            </button>
          </form>
        )}

        <div className="mt-4 space-y-3">
          {message && <AuthMessage tone="success">{message}</AuthMessage>}
          {error && <AuthMessage tone="danger">{error}</AuthMessage>}
        </div>
      </div>
    </div>
  );
}
