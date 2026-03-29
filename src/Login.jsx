// src/Login.jsx
import { useState } from "react";
import supabase from "./Backend/lib/supabaseClient";

export default function Login() {
  const [mode, setMode] = useState("signin"); // signin | signup | phone
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

  async function handleOAuth(provider) {
    try {
      resetMessages();
      setProviderLoading(provider);

      const { error } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo,
        },
      });

      if (error) throw error;
    } catch (err) {
      setError(err.message || `Failed to sign in with ${provider}`);
    } finally {
      setProviderLoading("");
    }
  }

  async function handleEmailSignIn(e) {
    e.preventDefault();

    try {
      resetMessages();
      setLoading(true);

      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) throw error;
    } catch (err) {
      setError(err.message || "Unable to sign in");
    } finally {
      setLoading(false);
    }
  }

  async function handleEmailSignUp(e) {
    e.preventDefault();

    try {
      resetMessages();
      setLoading(true);

      const { error } = await supabase.auth.signUp({
        email,
        password,
      });

      if (error) throw error;

      setMessage("Account created. Check your email if confirmation is enabled.");
    } catch (err) {
      setError(err.message || "Unable to sign up");
    } finally {
      setLoading(false);
    }
  }

  async function handleSendPhoneOtp(e) {
    e.preventDefault();

    try {
      resetMessages();
      setLoading(true);

      const { error } = await supabase.auth.signInWithOtp({
        phone,
      });

      if (error) throw error;

      setOtpSent(true);
      setMessage("OTP sent successfully.");
    } catch (err) {
      setError(err.message || "Unable to send OTP");
    } finally {
      setLoading(false);
    }
  }

  async function handleVerifyPhoneOtp(e) {
    e.preventDefault();

    try {
      resetMessages();
      setLoading(true);

      const { error } = await supabase.auth.verifyOtp({
        phone,
        token: otp,
        type: "sms",
      });

      if (error) throw error;

      setMessage("Phone verified and signed in.");
    } catch (err) {
      setError(err.message || "Invalid OTP");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-md border border-slate-200 p-8">
        <h1 className="text-2xl font-bold text-center text-blue-700 mb-8">
          Welcome to KunThai
        </h1>

        {/* OAuth buttons */}
        <div className="space-y-3">
          <button
            type="button"
            onClick={() => handleOAuth("google")}
            disabled={providerLoading !== ""}
            className="w-full border border-slate-300 rounded-xl px-4 py-4 text-slate-700 hover:bg-slate-50 transition disabled:opacity-60"
          >
            {providerLoading === "google" ? "Connecting Google..." : "Sign in with Google"}
          </button>

          <button
            type="button"
            onClick={() => handleOAuth("facebook")}
            disabled={providerLoading !== ""}
            className="w-full border border-slate-300 rounded-xl px-4 py-4 text-slate-700 hover:bg-slate-50 transition disabled:opacity-60"
          >
            {providerLoading === "facebook" ? "Connecting Facebook..." : "Sign in with Facebook"}
          </button>
        </div>

        <div className="my-6 border-t border-slate-200" />

        {/* mode switch */}
        <div className="grid grid-cols-3 gap-2 mb-6">
          <button
            type="button"
            onClick={() => {
              setMode("signin");
              resetMessages();
            }}
            className={`rounded-lg py-2 text-sm font-medium ${
              mode === "signin" ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-700"
            }`}
          >
            Sign In
          </button>

          <button
            type="button"
            onClick={() => {
              setMode("signup");
              resetMessages();
            }}
            className={`rounded-lg py-2 text-sm font-medium ${
              mode === "signup" ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-700"
            }`}
          >
            Sign Up
          </button>

          <button
            type="button"
            onClick={() => {
              setMode("phone");
              resetMessages();
            }}
            className={`rounded-lg py-2 text-sm font-medium ${
              mode === "phone" ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-700"
            }`}
          >
            Phone
          </button>
        </div>

        {/* Email sign in */}
        {mode === "signin" && (
          <form onSubmit={handleEmailSignIn} className="space-y-5">
            <div>
              <label className="block text-slate-700 mb-2">Email address</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Your email address"
                className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>

            <div>
              <label className="block text-slate-700 mb-2">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Your password"
                className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl py-3 font-semibold disabled:opacity-60"
            >
              {loading ? "Signing in..." : "Sign In"}
            </button>
          </form>
        )}

        {/* Email sign up */}
        {mode === "signup" && (
          <form onSubmit={handleEmailSignUp} className="space-y-5">
            <div>
              <label className="block text-slate-700 mb-2">Email address</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Your email address"
                className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>

            <div>
              <label className="block text-slate-700 mb-2">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Create password"
                className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white rounded-xl py-3 font-semibold disabled:opacity-60"
            >
              {loading ? "Creating account..." : "Create Account"}
            </button>
          </form>
        )}

        {/* Phone OTP */}
        {mode === "phone" && (
          <>
            {!otpSent ? (
              <form onSubmit={handleSendPhoneOtp} className="space-y-5">
                <div>
                  <label className="block text-slate-700 mb-2">Phone number</label>
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+232XXXXXXXX"
                    className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500"
                    required
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-purple-600 hover:bg-purple-700 text-white rounded-xl py-3 font-semibold disabled:opacity-60"
                >
                  {loading ? "Sending OTP..." : "Sign Up with Phone Number"}
                </button>
              </form>
            ) : (
              <form onSubmit={handleVerifyPhoneOtp} className="space-y-5">
                <div>
                  <label className="block text-slate-700 mb-2">Enter OTP</label>
                  <input
                    type="text"
                    value={otp}
                    onChange={(e) => setOtp(e.target.value)}
                    placeholder="6-digit code"
                    className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500"
                    required
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-purple-600 hover:bg-purple-700 text-white rounded-xl py-3 font-semibold disabled:opacity-60"
                >
                  {loading ? "Verifying..." : "Verify OTP"}
                </button>
              </form>
            )}
          </>
        )}

        {message && (
          <p className="mt-4 text-sm text-green-600 text-center">{message}</p>
        )}

        {error && (
          <p className="mt-4 text-sm text-red-600 text-center">{error}</p>
        )}
      </div>
    </div>
  );
}