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
import { t as i18nText, uiText } from "../../../../i18n/index";
import { uiText as translateUi, useI18n as useUiLocale } from "../../../../i18n/index.js";
import { inlineErrorMessage, isConnectionFailure } from "../../../../Backend/services/friendlyErrorService";
import { getRecoveryEmailState, requestRecoveryEmailConfirmation } from "../../../../Backend/services/emailRecoveryService";

const OFFER_DISMISSED_PREFIX = "kt_linked_email_offer_dismissed.";

// An account with no email of its own (phone sign-up) that has linked a
// social login with an email is offered that email for account recovery.
// Nothing changes unless they accept; then Supabase sends the confirmation.
function linkedEmailToOffer(identities = []) {
  for (const identity of identities) {
    if (!["google", "apple", "facebook"].includes(identity?.provider)) continue;
    const email = String(identity?.identity_data?.email || "").trim().toLowerCase();
    // Apple's private relay addresses still deliver, so they are fine.
    if (email && email.includes("@")) return email;
  }
  return "";
}

function offerDismissed(userId) {
  try {
    return window.localStorage.getItem(OFFER_DISMISSED_PREFIX + userId) === "1";
  } catch {
    return false;
  }
}

// Lets a signed-in KunThai user connect a social login to their account — the
// path for a phone-only account whose email does not match the Google/Facebook
// identity, so Supabase's automatic (same-verified-email) linking cannot apply.
const PROVIDERS = [
  { id: "google", label: "Google", Icon: FcGoogle, iconClass: "text-[22px]" },
  { id: "apple", label: "Apple", Icon: FaApple, iconClass: "text-[22px] text-black" },
  { id: "facebook", label: "Facebook", Icon: FaFacebookF, iconClass: "text-[20px] text-[#1877F2]" },
];

export default function LinkedAccountsSection({ currentUserId = "" }) {
  useUiLocale();
  const [identities, setIdentities] = useState(null); // null = still loading
  const [busyProvider, setBusyProvider] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [confirmUnlink, setConfirmUnlink] = useState("");
  const [emailOffer, setEmailOffer] = useState("");
  const [offerBusy, setOfferBusy] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const { data, error: idError } = await supabase.auth.getUserIdentities();
      if (idError) throw idError;
      const list = data?.identities || [];
      setIdentities(list);
      const offer = linkedEmailToOffer(list);
      if (offer && currentUserId && !offerDismissed(currentUserId)) {
        const recovery = await getRecoveryEmailState().catch(() => ({ status: "unknown" }));
        setEmailOffer(recovery.status === "none" ? offer : "");
      } else {
        setEmailOffer("");
      }
    } catch {
      // Non-fatal: treat every provider as linkable rather than blocking the UI.
      setIdentities([]);
    }
  }, [currentUserId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function acceptEmailOffer() {
    if (offerBusy || !emailOffer) return;
    setOfferBusy(true);
    setError("");
    try {
      await requestRecoveryEmailConfirmation(emailOffer);
      setNotice(i18nText("accountRecovery.linkEmailSent", { email: emailOffer }));
      setEmailOffer("");
    } catch (err) {
      setError(inlineErrorMessage(err, i18nText("accountRecovery.linkEmailFailed")));
    } finally {
      setOfferBusy(false);
    }
  }

  function dismissEmailOffer() {
    try {
      window.localStorage.setItem(OFFER_DISMISSED_PREFIX + currentUserId, "1");
    } catch {
      // Not remembered on this device; it is offered again next time.
    }
    setEmailOffer("");
  }

  // Native linking finishes through the shared deep-link callback; refresh the
  // linked list and surface the outcome.
  useEffect(() => {
    function handleSettled(event) {
      const detail = event.detail || {};
      setBusyProvider("");
      if (detail.status === "error") {
        setError(inlineErrorMessage(detail, uiText("We couldn't link that account. Please try again.")));
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
        setError(i18nText("exploreSettingsFix.linkingUnavailable"));
      } else if (message.includes("already")) {
        setError(uiText("This social account is already connected to another KunThai account."));
      } else {
        setError(inlineErrorMessage(err, uiText("We couldn't start account linking. Please try again.")));
      }
    }
  }

  // Unlinking is allowed only while another way to sign in remains.
  const canUnlink = (identities || []).length > 1;

  async function handleUnlink(provider) {
    if (busyProvider || !canUnlink) return;
    const identity = (identities || []).find((item) => item.provider === provider);
    if (!identity) return;
    setError("");
    setNotice("");
    setConfirmUnlink("");
    setBusyProvider(provider);
    try {
      const { error: unlinkError } = await supabase.auth.unlinkIdentity(identity);
      if (unlinkError) throw unlinkError;
      setNotice(i18nText("exploreSettingsFix.unlinked"));
      await refresh();
    } catch (err) {
      setError(isConnectionFailure(err) ? i18nText("common.networkLost") : i18nText("exploreSettingsFix.unlinkFailed"));
    } finally {
      setBusyProvider("");
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
            <p className="mt-3 rounded-2xl bg-rose-50 px-3 py-2 text-sm font-bold text-rose-700">{translateUi(error)}</p>
          ) : null}
          {notice ? (
            <p className="mt-3 rounded-2xl bg-emerald-50 px-3 py-2 text-sm font-bold text-emerald-700">{translateUi(notice)}</p>
          ) : null}

          {emailOffer ? (
            <div className="mt-3 rounded-2xl border border-sky-200 bg-sky-50 p-4">
              <p className="text-sm font-black text-slate-950">{i18nText("accountRecovery.linkEmailTitle")}</p>
              <p className="mt-1 break-words text-sm font-semibold leading-6 text-slate-600">
                {i18nText("accountRecovery.linkEmailBody", { email: emailOffer })}
              </p>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={dismissEmailOffer}
                  disabled={offerBusy}
                  className="min-h-11 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-black text-slate-700 disabled:opacity-60"
                >
                  {i18nText("accountRecovery.linkEmailLater")}
                </button>
                <button
                  type="button"
                  onClick={acceptEmailOffer}
                  disabled={offerBusy}
                  className="min-h-11 rounded-2xl bg-sky-700 px-4 text-sm font-black text-white disabled:opacity-60"
                >
                  {offerBusy ? i18nText("exploreSettingsFix.working") : i18nText("accountRecovery.linkEmailUse")}
                </button>
              </div>
            </div>
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
                    <span className="truncate text-sm font-black text-slate-900">{translateUi(label)}</span>
                  </span>

                  {linked ? (
                    <span className="flex flex-wrap items-center justify-end gap-2">
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-black text-emerald-700">
                        <HiOutlineCheckCircle className="text-base" />
                        {uiText("Linked")}
                      </span>
                      {canUnlink ? (
                        confirmUnlink === id ? (
                          <>
                            <button type="button" onClick={() => setConfirmUnlink("")} disabled={Boolean(busyProvider)} className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-black text-slate-700">
                              {i18nText("exploreSettingsFix.cancel")}
                            </button>
                            <button type="button" onClick={() => handleUnlink(id)} disabled={Boolean(busyProvider)} className="rounded-full bg-rose-600 px-3 py-1.5 text-xs font-black text-white disabled:opacity-60">
                              {busy ? i18nText("exploreSettingsFix.working") : i18nText("exploreSettingsFix.unlinkConfirm")}
                            </button>
                          </>
                        ) : (
                          <button type="button" onClick={() => setConfirmUnlink(id)} disabled={Boolean(busyProvider)} className="rounded-full border border-slate-200 px-3 py-1.5 text-xs font-black text-slate-600 disabled:opacity-60">
                            {i18nText("exploreSettingsFix.unlink")}
                          </button>
                        )
                      ) : null}
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
