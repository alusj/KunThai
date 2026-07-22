import { useMemo, useState } from "react";
import {
  HiOutlineArrowRightOnRectangle,
  HiOutlineCheckCircle,
  HiOutlineDevicePhoneMobile,
  HiOutlineEnvelope,
  HiOutlineUserCircle,
} from "react-icons/hi2";

import {
  getRememberedSocialAccounts,
  hasVaultedSession,
  signOutSocialSession,
  switchToRememberedSocialAccount,
} from "../../../../Backend/services/sessionService";
import { useI18n } from "../../../../i18n";

function getIdentifier(account = {}) {
  return account.identifier || account.email || account.phone || "";
}

function AccountAvatar({ account, active }) {
  if (account.avatarUrl) {
    return <img src={account.avatarUrl} alt="" className="h-12 w-12 rounded-2xl object-cover" />;
  }

  return (
    <span className={`flex h-12 w-12 items-center justify-center rounded-2xl ${active ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>
      <HiOutlineUserCircle className="text-2xl" />
    </span>
  );
}

export default function SwitchAccountScreen({ currentProfile = {}, user = null }) {
  const { t } = useI18n();
  const [status, setStatus] = useState("");
  const currentUserId = currentProfile?.userId || user?.id || "";
  const accounts = useMemo(() => {
    const remembered = getRememberedSocialAccounts();
    if (!currentUserId || remembered.some((account) => account.id === currentUserId)) return remembered;

    return [
      {
        id: currentUserId,
        avatarUrl: currentProfile.avatarUrl || "",
        displayName: currentProfile.displayName || user?.email?.split("@")[0] || user?.phone || "Current account",
        email: user?.email || currentProfile.email || "",
        identifier: user?.email || user?.phone || currentProfile.email || currentProfile.phone || "",
        phone: user?.phone || currentProfile.phone || "",
        provider: user?.app_metadata?.provider || "current",
      },
      ...remembered,
    ];
  }, [currentProfile, currentUserId, user]);

  async function chooseAccount(account) {
    if (account.id === currentUserId) {
      setStatus(t("switchAccount.alreadyActive"));
      return;
    }

    const instant = hasVaultedSession(account.id);

    try {
      setStatus(instant ? t("switchAccount.switching") : t("switchAccount.openingSignIn"));
      const result = await switchToRememberedSocialAccount(account);
      if (result?.switched === false && instant) {
        setStatus(t("switchAccount.sessionExpired"));
      }
    } catch (error) {
      setStatus(error.message || "Unable to switch account right now.");
    }
  }

  async function signOut() {
    try {
      setStatus("Signing out...");
      await signOutSocialSession();
    } catch (error) {
      setStatus(error.message || "Unable to sign out right now.");
    }
  }

  return (
    <div className="w-full space-y-4 px-4 py-4 sm:px-6 lg:px-8">
      <section className="rounded-[26px] border border-slate-200 bg-white p-5 shadow-sm">
        <p className="text-xs font-black uppercase tracking-[0.2em] text-sky-700">Device accounts</p>
        <h3 className="mt-1 text-2xl font-black text-slate-950">{t("switchAccount.title")}</h3>
        <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">
          {t("switchAccount.subtitle")}
        </p>
        {status ? <p className="mt-3 rounded-2xl bg-sky-50 px-4 py-3 text-sm font-black text-sky-700">{status}</p> : null}
      </section>

      <section className="grid gap-3">
        {accounts.length ? (
          accounts.map((account) => {
            const active = account.id === currentUserId;
            const instant = !active && hasVaultedSession(account.id);
            const identifier = getIdentifier(account);
            return (
              <article key={`${account.id}-${identifier}`} className="rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex items-start gap-3">
                  <AccountAvatar account={account} active={active} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h4 className="truncate text-base font-black text-slate-950">{account.displayName || "KunThai account"}</h4>
                      {active ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-black text-emerald-700">
                          <HiOutlineCheckCircle />
                          Active
                        </span>
                      ) : instant ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-sky-50 px-2.5 py-1 text-[11px] font-black text-sky-700">
                          {t("switchAccount.readyToSwitch")}
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-1 flex items-center gap-2 truncate text-sm font-semibold text-slate-500">
                      {String(account.provider || "").includes("phone") ? <HiOutlineDevicePhoneMobile /> : <HiOutlineEnvelope />}
                      <span className="truncate">{identifier || account.provider || "Saved account"}</span>
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => chooseAccount(account)}
                  disabled={active}
                  className={`mt-4 h-11 w-full rounded-2xl text-sm font-black ${
                    active ? "bg-slate-100 text-slate-400" : "bg-slate-950 text-white"
                  }`}
                >
                  {active ? t("switchAccount.currentAccount") : instant ? t("switchAccount.switchTo") : t("switchAccount.signInAs")}
                </button>
              </article>
            );
          })
        ) : (
          <div className="rounded-[24px] border border-dashed border-slate-300 bg-white p-6 text-center">
            <HiOutlineUserCircle className="mx-auto text-4xl text-slate-400" />
            <p className="mt-3 text-base font-black text-slate-950">{t("switchAccount.noAccountsTitle")}</p>
            <p className="mt-1 text-sm font-semibold leading-6 text-slate-500">
              {t("switchAccount.noAccountsSubtitle")}
            </p>
          </div>
        )}
      </section>

      <button
        type="button"
        onClick={signOut}
        className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl border border-rose-100 bg-rose-50 text-sm font-black text-rose-700"
      >
        <HiOutlineArrowRightOnRectangle />
        {t("switchAccount.signOutCurrent")}
      </button>
    </div>
  );
}
