import { useEffect, useState } from "react";
import { KeyRound, LoaderCircle, LockKeyhole, ShieldCheck } from "lucide-react";
import supabase from "../Backend/lib/supabaseClient";

export default function AdminMfaGate({ children, bypass = false }) {
  const [state, setState] = useState({ loading: !bypass, verified: bypass, mode: "checking", factorId: "", qr: "", secret: "" });
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (bypass) return;
    let active = true;

    async function inspectMfa() {
      const assurance = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if (!active) return;
      if (assurance.error) {
        setState((current) => ({ ...current, loading: false, mode: "error" }));
        setError(assurance.error.message || "Unable to check multi-factor authentication.");
        return;
      }
      if (assurance.data?.currentLevel === "aal2") {
        setState((current) => ({ ...current, loading: false, verified: true, mode: "verified" }));
        return;
      }

      const factors = await supabase.auth.mfa.listFactors();
      if (!active) return;
      const verifiedFactor = factors.data?.totp?.find((factor) => factor.status === "verified");
      if (verifiedFactor) {
        setState((current) => ({ ...current, loading: false, mode: "challenge", factorId: verifiedFactor.id }));
        return;
      }
      setState((current) => ({ ...current, loading: false, mode: "enroll" }));
    }

    inspectMfa();
    return () => { active = false; };
  }, [bypass]);

  async function beginEnrollment() {
    setBusy(true);
    setError("");
    const result = await supabase.auth.mfa.enroll({ factorType: "totp", friendlyName: "KunThai Admin" });
    if (result.error) setError(result.error.message || "Unable to start MFA setup.");
    else setState((current) => ({ ...current, mode: "verify-enrollment", factorId: result.data.id, qr: result.data.totp.qr_code, secret: result.data.totp.secret }));
    setBusy(false);
  }

  async function verify() {
    if (code.trim().length < 6) return;
    setBusy(true);
    setError("");
    const result = await supabase.auth.mfa.challengeAndVerify({ factorId: state.factorId, code: code.trim() });
    if (result.error) setError(result.error.message || "The verification code was not accepted.");
    else setState((current) => ({ ...current, verified: true, mode: "verified" }));
    setBusy(false);
  }

  if (state.verified) return children;

  return (
    <main className="flex min-h-screen items-center justify-center bg-zinc-100 p-5">
      <section className="w-full max-w-md rounded-lg border border-zinc-200 bg-white p-6 shadow-sm sm:p-8">
        <span className="grid h-11 w-11 place-items-center rounded-lg bg-zinc-950 text-emerald-400">
          <LockKeyhole size={23} aria-hidden="true" />
        </span>
        <h1 className="mt-6 text-2xl font-black text-zinc-950">Security verification</h1>

        {state.loading ? (
          <div className="mt-6 flex items-center gap-3 text-sm font-semibold text-zinc-600">
            <LoaderCircle className="animate-spin" size={18} />
            Checking your admin security…
          </div>
        ) : null}

        {state.mode === "enroll" ? (
          <div className="mt-4">
            <p className="text-sm font-medium leading-6 text-zinc-600">Admin accounts require an authenticator app before the workspace can open.</p>
            <button type="button" onClick={beginEnrollment} disabled={busy} className="mt-6 inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-zinc-950 px-4 text-sm font-black text-white hover:bg-zinc-800 disabled:opacity-60">
              {busy ? <LoaderCircle className="animate-spin" size={18} /> : <ShieldCheck size={18} />}
              Set up authenticator
            </button>
          </div>
        ) : null}

        {state.mode === "verify-enrollment" ? (
          <div className="mt-5">
            <p className="text-sm font-medium leading-6 text-zinc-600">Scan this code in your authenticator app, then enter the six-digit code.</p>
            <div className="mx-auto mt-5 w-fit rounded-lg border border-zinc-200 bg-white p-3">
              <img src={state.qr} alt="Authenticator setup QR code" className="h-44 w-44" />
            </div>
            <p className="mt-3 break-all rounded-md bg-zinc-100 px-3 py-2 text-center font-mono text-xs text-zinc-700">{state.secret}</p>
          </div>
        ) : null}

        {["challenge", "verify-enrollment"].includes(state.mode) ? (
          <div className="mt-6 space-y-4">
            <label className="block">
              <span className="mb-2 block text-sm font-bold text-zinc-800">Authenticator code</span>
              <input value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" className="h-12 w-full rounded-lg border border-zinc-300 px-3 text-center font-mono text-xl font-black text-zinc-950 focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-100" />
            </label>
            <button type="button" onClick={verify} disabled={busy || code.length < 6} className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-zinc-950 px-4 text-sm font-black text-white hover:bg-zinc-800 disabled:opacity-60">
              {busy ? <LoaderCircle className="animate-spin" size={18} /> : <KeyRound size={18} />}
              Verify and continue
            </button>
          </div>
        ) : null}

        {error ? <p role="alert" className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">{error}</p> : null}
      </section>
    </main>
  );
}
