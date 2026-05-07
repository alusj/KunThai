import { useState } from "react";

import supabase from "./Backend/lib/supabaseClient";

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

export default function Login() {
  const [mode, setMode] = useState("signin");
  const [signupStep, setSignupStep] = useState("options");
  const [signupMethod, setSignupMethod] = useState("");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [providerLoading, setProviderLoading] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const redirectTo = window.location.origin;

  function resetMessages() {
    setError("");
    setMessage("");
  }

  function switchMode(nextMode) {
    setMode(nextMode);
    setSignupStep("options");
    setSignupMethod("");
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
  }

  async function handleCreateAccount(event) {
    event.preventDefault();

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    try {
      resetMessages();
      setLoading(true);

      const { error: authError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: redirectTo,
        },
      });

      if (authError) {
        throw authError;
      }

      setMessage("Verification sent. Please check your email.");
    } catch (err) {
      setError(err.message || "Unable to create your account.");
    } finally {
      setLoading(false);
    }
  }

  const isLoading = providerLoading !== "" || loading;

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 px-4 py-8">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <h1 className="text-center text-3xl font-bold text-slate-900">
          Welcome to KunTai
        </h1>

        {mode === "signin" && (
          <div className="mt-8 space-y-3">
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
        )}

        {mode === "signup" && signupStep === "options" && (
          <div className="mt-8 space-y-3">
            <button
              type="button"
              onClick={() => openSignupDetails("Google")}
              disabled={isLoading}
              className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
            >
              Sign up with Google
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

            <AuthInput
              label="Email Account"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="Enter email account"
              required
            />

            <AuthInput
              label="Password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Enter password"
              required
            />

            <AuthInput
              label="Confirm Password"
              type="password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              placeholder="Confirm password"
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

