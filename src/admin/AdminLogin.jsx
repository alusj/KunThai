import { useState } from "react";
import { ArrowLeft, Eye, EyeOff, KeyRound, LoaderCircle, ShieldCheck } from "lucide-react";
import supabase from "../Backend/lib/supabaseClient";

export default function AdminLogin() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const { error: signInError } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (signInError) setError(signInError.message || "Sign in failed.");
    setBusy(false);
  }

  async function continueWithGoogle() {
    setBusy(true);
    setError("");
    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/admin` },
    });
    if (oauthError) {
      setError(oauthError.message || "Google sign in failed.");
      setBusy(false);
    }
  }

  return (
    <main className="grid min-h-screen bg-zinc-100 lg:grid-cols-[minmax(20rem,0.7fr)_1fr]">
      <section className="hidden bg-zinc-950 p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-lg bg-emerald-500 text-zinc-950">
            <ShieldCheck size={22} aria-hidden="true" />
          </span>
          <div>
            <p className="text-lg font-black">KunThai Admin</p>
            <p className="text-xs font-semibold text-zinc-400">Protected operations workspace</p>
          </div>
        </div>
        <div className="max-w-md">
          <p className="text-3xl font-black leading-tight">One operating view across every KunThai sector.</p>
          <p className="mt-4 text-sm font-medium leading-6 text-zinc-400">
            Access is assigned by role, sector, region, and authority. Every sensitive action is recorded.
          </p>
        </div>
        <p className="text-xs font-semibold text-zinc-500">Explore / UrMall / Transport</p>
      </section>

      <section className="flex min-h-screen items-center justify-center p-5 sm:p-10">
        <div className="w-full max-w-md">
          <a href="/" className="mb-10 inline-flex items-center gap-2 text-sm font-bold text-zinc-600 hover:text-zinc-950">
            <ArrowLeft size={17} aria-hidden="true" />
            Back to KunThai
          </a>

          <div className="mb-8 lg:hidden">
            <span className="mb-4 grid h-11 w-11 place-items-center rounded-lg bg-zinc-950 text-emerald-400">
              <ShieldCheck size={24} aria-hidden="true" />
            </span>
            <p className="text-sm font-black text-emerald-700">KunThai Admin</p>
          </div>

          <h1 className="text-3xl font-black text-zinc-950">Admin sign in</h1>
          <p className="mt-2 text-sm font-medium text-zinc-600">Use the KunThai account connected to your admin assignment.</p>

          <form className="mt-8 space-y-5" onSubmit={submit}>
            <label className="block">
              <span className="mb-2 block text-sm font-bold text-zinc-800">Email address</span>
              <input
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="h-12 w-full rounded-lg border border-zinc-300 bg-white px-3 text-sm font-semibold text-zinc-950 shadow-sm outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100"
              />
            </label>
            <label className="block">
              <span className="mb-2 block text-sm font-bold text-zinc-800">Password</span>
              <span className="relative block">
                <input
                  type={showPassword ? "text" : "password"}
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className="h-12 w-full rounded-lg border border-zinc-300 bg-white px-3 pr-12 text-sm font-semibold text-zinc-950 shadow-sm outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100"
                />
                <button
                  type="button"
                  title={showPassword ? "Hide password" : "Show password"}
                  onClick={() => setShowPassword((value) => !value)}
                  className="absolute right-1 top-1 grid h-10 w-10 place-items-center rounded-md text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900"
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </span>
            </label>

            {error ? <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">{error}</p> : null}

            <button
              type="submit"
              disabled={busy}
              className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-zinc-950 px-4 text-sm font-black text-white shadow-sm hover:bg-zinc-800 disabled:opacity-60"
            >
              {busy ? <LoaderCircle className="animate-spin" size={18} /> : <KeyRound size={18} />}
              Sign in securely
            </button>
          </form>

          <div className="my-6 flex items-center gap-3 text-xs font-bold uppercase text-zinc-400">
            <span className="h-px flex-1 bg-zinc-300" />
            or
            <span className="h-px flex-1 bg-zinc-300" />
          </div>

          <button
            type="button"
            disabled={busy}
            onClick={continueWithGoogle}
            className="inline-flex h-12 w-full items-center justify-center rounded-lg border border-zinc-300 bg-white px-4 text-sm font-black text-zinc-800 shadow-sm hover:bg-zinc-50 disabled:opacity-60"
          >
            Continue with Google
          </button>
        </div>
      </section>
    </main>
  );
}
