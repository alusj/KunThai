import { useCallback, useEffect, useState } from "react";
import { FaApple, FaFacebookF } from "react-icons/fa";
import { FcGoogle } from "react-icons/fc";
import { HiOutlineCheckCircle, HiOutlineLink } from "react-icons/hi2";

import supabase from "../../../../Backend/lib/supabaseClient";
import {
  isNativePlatform,
  linkOAuthIdentity,
  OAUTH_SETTLED_EVENT,
} from "../../../../Backend/services/nativeOAuthService";
import { uiText } from "../../../../i18n/index";

// Lets a signed-in KunThai user connect a social login to their account — the
// path for a phone-only account whose email does not match the Google/Facebook
// identity, so Supabase's automatic (same-verified-email) linking cannot apply.
const PROVIDERS = [
  { id: "google", label: "Google", Icon: FcGoogle, iconClass: "text-[22px]" },
  { id: "apple", label: "Apple", Icon: FaApple, iconClass: "text-[22px] text-black" },
  { id: "facebook", label: "Facebook", Icon: FaFacebookF, iconClass: "text-[20px] text-[#1877F2]" },
];

export default function LinkedAccountsSection({ currentUserId = "" }) {
  const [identities, setIdentities] = useState(null); // null = still loading
  const [busyProvider, setBusyProvider] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const refresh = useCallback(async () => {
    try {
      const { data, error: idError } = await supabase.auth.getUserIdentities();
      if (idError) throw idError;
      setIdentities(data?.identities || []);
    } catch {
      // Non-fatal: treat every provider as linkable rather than blocking the UI.
      setIdentities([]);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Native linking finishes through the shared deep-link callback; refresh the
  // linked list and surface the outcome.
  useEffect(() => {
    function handleSettled(event) {
      const detail = event.detail || {};
      setBusyProvider("");
      if (detail.status === "error") {
        setError(detail.message || uiText("We couldn't link that account. Please try again."));
      } else if (detail.status === "success") {
        setError("");
        setNotice(uiText("Social account linked to your KunThai account."));
        refresh();
      }
      // "cancelled" is silent — the user backed out on purpose.
    }

    window.addEventListener(OAUTH_SETTLED_EVENT, handleSettled);
    return () => window.removeEventListener(OAUTH_SETTLED_EVENT, handleSettled);
  }, [refresh]);

  const linkedProviders = new Set((identities || []).map((identity) => identity.provider));

  async function handleLink(provider) {
    if (busyProvider) return;
    setError("");
    setNotice("");
    setBusyProvider(provider);

    try {
      await linkOAuthIdentity(provider);
      // Native: the settled listener clears busy + refreshes.
      // Web: the page redirects to the provider and returns here re-mounted.
      if (!isNativePlatform()) return;
    } catch (err) {
      setBusyProvider("");
      const message = String(err?.message || "").toLowerCase();
      if (message.includes("manual linking") || message.includes("linking is disabled")) {
        setError(uiText("Account linking is turned off. Enable Manual Linking in your Supabase Authentication settings."));
      } else if (message.includes("already")) {
        setError(uiText("This social account is already connected to another KunThai account."));
      } else {
        setError(err?.message || uiText("We couldn't start account linking. Please try again."));
      }
    }
  }

  if (!currentUserId) return null;

  return (
    <section className="rounded-[24px] border border-sky-100 bg-white p-5 shadow-sm">
      <div className="flex items-start gap-3">
        <span className="grid h-12 w-12 flex-none place-items-center rounded-2xl bg-sky-50 text-sky-700">
          <HiOutlineLink className="text-2xl" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-base font-black text-slate-950">{uiText("Linked social accounts")}</h3>
          <p className="mt-1 max-w-2xl text-sm font-semibold leading-6 text-slate-500">
            {uiText("Connect Google, Apple, or Facebook so you can sign in to this KunThai account with one tap.")}
          </p>

          {error ? (
            <p className="mt-3 rounded-2xl bg-rose-50 px-3 py-2 text-sm font-bold text-rose-700">{error}</p>
          ) : null}
          {notice ? (
            <p className="mt-3 rounded-2xl bg-emerald-50 px-3 py-2 text-sm font-bold text-emerald-700">{notice}</p>
          ) : null}

          <div className="mt-4 space-y-2">
            {PROVIDERS.map(({ id, label, Icon, iconClass }) => {
              const linked = linkedProviders.has(id);
              const busy = busyProvider === id;
              return (
                <div
                  key={id}
                  className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 px-3 py-2.5"
                >
                  <span className="flex min-w-0 items-center gap-3">
                    <Icon className={`shrink-0 ${iconClass}`} aria-hidden="true" />
                    <span className="truncate text-sm font-black text-slate-900">{label}</span>
                  </span>

                  {linked ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-black text-emerald-700">
                      <HiOutlineCheckCircle className="text-base" />
                      {uiText("Linked")}
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleLink(id)}
                      disabled={Boolean(busyProvider) || identities === null}
                      className="rounded-full bg-sky-700 px-4 py-1.5 text-xs font-black text-white transition hover:bg-sky-800 disabled:bg-slate-200 disabled:text-slate-500"
                    >
                      {busy ? uiText("Connecting…") : uiText("Link")}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
