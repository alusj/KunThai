import { useEffect, useState } from "react";
import { LogOut, ShieldCheck } from "lucide-react";

import { signOutUser } from "../../Backend/services/authService";
import {
  isTwoFactorChallengeRequired,
  verifyTwoFactorLogin,
} from "../../Backend/services/twoFactorService";
import { t as i18nText } from "../../i18n/index";

// Blocks the workspace after password sign-in until the authenticator code is
// verified, for accounts with two-step verification turned on. Accounts
// without 2FA pass straight through.
export default function TwoFactorGate({ user, children }) {
  const [required, setRequired] = useState(null);
  const [code, setCode] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState("");
  const userId = user?.id || "";
  const guest = Boolean(user?.is_anonymous);

  useEffect(() => {
    let active = true;

    if (!userId || guest) {
      setRequired(false);
      return undefined;
    }

    setRequired(null);
    isTwoFactorChallengeRequired()
      .then((needsChallenge) => {
        if (active) setRequired(Boolean(needsChallenge));
      })
      .catch(() => {
        // If the check itself fails, do not lock the user out of the app.
        if (active) setRequired(false);
      });

    return () => {
      active = false;
    };
  }, [guest, userId]);

  if (required === null) {
    // Blend into the single app loading backdrop instead of adding a separate
    // "Checking account security" screen — the check is brief and the extra
    // wording just stacked another loading state on top of the app skeleton.
    return <div className="min-h-dvh bg-slate-100" aria-label={i18nText("ui.literals.k721d964bf95b")} />;
  }

  if (!required) return children;

  async function handleVerify(event) {
    event.preventDefault();
    try {
      setVerifying(true);
      setError("");
      await verifyTwoFactorLogin(code);
      setRequired(false);
    } catch (nextError) {
      setError(nextError.message || i18nText("ui.literals.kd1d9d6ac014b"));
    } finally {
      setVerifying(false);
    }
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-slate-100 px-4 py-8">
      <section className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <span className="grid h-12 w-12 place-items-center rounded-2xl bg-emerald-50 text-emerald-700">
          <ShieldCheck size={24} />
        </span>
        <h1 className="mt-5 text-2xl font-black text-slate-950">{i18nText("ui.literals.k2a0b5e8fabe4")}</h1>
        <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">
          {i18nText("ui.literals.kf0aab8865fd9")}
        </p>

        <form onSubmit={handleVerify} className="mt-5 space-y-3">
          <input
            type="text"
            inputMode="numeric"
            autoFocus
            value={code}
            onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
            placeholder={i18nText("ui.literals.k0c52ea2c403b")}
            className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-center text-lg font-black tracking-[0.4em] text-slate-900 outline-none transition placeholder:text-sm placeholder:font-semibold placeholder:tracking-normal placeholder:text-slate-400 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
          />
          {error ? (
            <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-700">{error}</p>
          ) : null}
          <button
            type="submit"
            disabled={verifying || code.length < 6}
            className="min-h-12 w-full rounded-xl bg-emerald-600 px-4 py-3 text-sm font-black text-white transition hover:bg-emerald-700 disabled:opacity-60"
          >
            {verifying ? i18nText("ui.literals.kbf6ea5406002") : i18nText("ui.literals.k882666b4379f")}
          </button>
        </form>

        <button
          type="button"
          onClick={() => signOutUser()}
          className="mt-3 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-slate-300 px-4 py-3 text-sm font-black text-slate-700 transition hover:bg-slate-50"
        >
          <LogOut size={17} /> {i18nText("ui.literals.kdc1649a16c14")}
        </button>
      </section>
    </div>
  );
}
