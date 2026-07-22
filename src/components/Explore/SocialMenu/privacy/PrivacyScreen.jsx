import { createElement, useEffect, useState } from "react";
import {
  HiOutlineArrowDownTray,
  HiOutlineBolt,
  HiOutlineChatBubbleLeftRight,
  HiOutlineCircleStack,
  HiOutlineEye,
  HiOutlinePauseCircle,
  HiOutlineShieldCheck,
  HiOutlineTrash,
  HiOutlineUserMinus,
} from "react-icons/hi2";

import { useTrustSafety } from "../../../../Backend/hooks/useTrustSafety";
import {
  deleteKunThaiAccount,
  fetchAccountDeactivation,
  setAccountDeactivated,
} from "../../../../Backend/services/accountLifecycleService";
import { collectKunThaiDataExport, downloadDataExport } from "../../../../Backend/services/dataExportService";
import { showToast } from "../../../../Backend/services/toastService";
import { useI18n } from "../../../../i18n";
import EmptyState from "../../shared/EmptyState";
import SocialScreenHeader from "../shared/SocialScreenHeader";

function SettingRow({ children, description, icon, title }) {
  return (
    <div className="flex flex-col gap-4 rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-start gap-3">
        <span className="flex h-12 w-12 flex-none items-center justify-center rounded-2xl bg-sky-50 text-sky-700">
          {createElement(icon, { className: "text-2xl" })}
        </span>
        <div className="min-w-0">
          <p className="text-base font-black text-slate-950">{title}</p>
          <p className="mt-1 text-sm font-semibold leading-6 text-slate-500">{description}</p>
        </div>
      </div>
      <div className="flex-none">{children}</div>
    </div>
  );
}

function PrivacySection({ children, description, title }) {
  return (
    <section className="space-y-3">
      <div className="px-1">
        <p className="text-xs font-black uppercase tracking-[0.2em] text-sky-700">{title}</p>
        <p className="mt-1 text-sm font-semibold leading-6 text-slate-500">{description}</p>
      </div>
      <div className="grid gap-3 xl:grid-cols-2">{children}</div>
    </section>
  );
}

export default function PrivacyScreen({ hideHeader = false, onOpenPermissions }) {
  const { t } = useI18n();
  const safety = useTrustSafety();
  const settings = safety.privacySettings;
  const blockedUsers = Array.from(safety.blockedUsers);
  const [deactivatedAt, setDeactivatedAt] = useState(null);
  const [confirmAction, setConfirmAction] = useState(null);
  const [accountActionBusy, setAccountActionBusy] = useState(false);
  const [exportState, setExportState] = useState({ busy: false, step: "" });

  useEffect(() => {
    let active = true;

    fetchAccountDeactivation()
      .then((value) => {
        if (active) setDeactivatedAt(value);
      })
      .catch(() => {});

    return () => {
      active = false;
    };
  }, []);

  async function handleDeactivateConfirm() {
    setAccountActionBusy(true);

    try {
      if (deactivatedAt) {
        await setAccountDeactivated(false);
        setDeactivatedAt(null);
        showToast("Your account is active and visible again.", "success");
      } else {
        await setAccountDeactivated(true);
        setDeactivatedAt(new Date().toISOString());
        showToast("Your account is deactivated. Other users now see it as unavailable.", "success");
      }
      setConfirmAction(null);
    } catch (error) {
      showToast(error.message || "Unable to update your account status.", "danger");
    } finally {
      setAccountActionBusy(false);
    }
  }

  async function handleDataExport() {
    if (exportState.busy) return;
    setExportState({ busy: true, step: "Starting your export..." });

    try {
      const payload = await collectKunThaiDataExport((step) => setExportState({ busy: true, step }));
      downloadDataExport(payload);
      setExportState({ busy: false, step: "" });
      showToast(t("privacy.exportDone"), "success");
    } catch (error) {
      setExportState({ busy: false, step: "" });
      showToast(error.message || t("privacy.exportFailed"), "danger");
    }
  }

  async function handleDeleteConfirm() {
    setAccountActionBusy(true);

    try {
      await deleteKunThaiAccount();
      window.location.replace("/");
    } catch (error) {
      showToast(error.message || "Unable to delete your account.", "danger");
      setAccountActionBusy(false);
    }
  }

  return (
    <div>
      {!hideHeader ? <SocialScreenHeader title="Privacy Center" subtitle="Manage audiences, messages, activity, blocks, and data choices." /> : null}

      <div className="w-full space-y-6 px-4 py-4 sm:px-6 lg:px-8">
        <div className="rounded-[26px] border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-sky-700">Privacy Center</p>
          <h3 className="mt-1 text-2xl font-black text-slate-950">Your account, your boundaries</h3>
          <p className="mt-2 max-w-3xl text-base font-semibold leading-7 text-slate-600">Choose how people reach you, what appears publicly, and which data features you want to review.</p>
          {safety.feedback ? <p className="mt-3 text-sm font-black text-sky-700">{safety.feedback}</p> : null}
        </div>

        <PrivacySection title="Account privacy" description="Set the starting audience for new content and conversations.">
          <SettingRow icon={HiOutlineEye} title="Account and post privacy" description="Choose the audience selected by default when creating new posts.">
            <select
              value={settings.defaultPostPrivacy}
              onChange={(event) => safety.updatePrivacySettings({ defaultPostPrivacy: event.target.value })}
              className="h-11 rounded-2xl bg-slate-100 px-4 text-sm font-black text-slate-700 outline-none"
            >
              <option value="public">Public</option>
              <option value="circle">Circle</option>
              <option value="private">Private</option>
            </select>
          </SettingRow>

          <SettingRow icon={HiOutlineChatBubbleLeftRight} title="Message privacy" description="Control who should be allowed to start conversations with you.">
            <select
              value={settings.allowMessages}
              onChange={(event) => safety.updatePrivacySettings({ allowMessages: event.target.value })}
              className="h-11 rounded-2xl bg-slate-100 px-4 text-sm font-black text-slate-700 outline-none"
            >
              <option value="everyone">Everyone</option>
              <option value="followers">Connections</option>
              <option value="none">No one</option>
            </select>
          </SettingRow>
        </PrivacySection>

        <PrivacySection title="Participation visibility" description="Decide how your name and activity appear in social spaces.">
          <SettingRow icon={HiOutlineShieldCheck} title="Mentions" description="Allow people to mention you in comments and posts.">
            <button
              type="button"
              onClick={() => safety.updatePrivacySettings({ allowMentions: !settings.allowMentions })}
              className={`h-11 rounded-2xl px-4 text-sm font-black ${settings.allowMentions ? "bg-sky-700 text-white" : "bg-slate-100 text-slate-600"}`}
            >
              {settings.allowMentions ? "Allowed" : "Off"}
            </button>
          </SettingRow>

          <SettingRow icon={HiOutlineBolt} title="Activity visibility" description="Show likes, connections, and recent social actions on your profile activity surfaces.">
            <button
              type="button"
              onClick={() => safety.updatePrivacySettings({ showActivity: !settings.showActivity })}
              className={`h-11 rounded-2xl px-4 text-sm font-black ${settings.showActivity ? "bg-sky-700 text-white" : "bg-slate-100 text-slate-600"}`}
            >
              {settings.showActivity ? "Visible" : "Hidden"}
            </button>
          </SettingRow>
        </PrivacySection>

        <PrivacySection title="Content protection" description="Use filtering controls to reduce unwanted or risky content.">
          <SettingRow icon={HiOutlineShieldCheck} title="Sensitive content filter" description="Hide posts that may contain flagged or abusive language.">
            <button
              type="button"
              onClick={() => safety.updatePrivacySettings({ filterSensitiveContent: !settings.filterSensitiveContent })}
              className={`h-11 rounded-2xl px-4 text-sm font-black ${settings.filterSensitiveContent ? "bg-sky-700 text-white" : "bg-slate-100 text-slate-600"}`}
            >
              {settings.filterSensitiveContent ? "On" : "Off"}
            </button>
          </SettingRow>
        </PrivacySection>

        <section className="rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center gap-2">
            <HiOutlineUserMinus className="text-xl text-rose-600" />
            <h3 className="text-base font-black text-slate-950">Blocked users</h3>
          </div>
          {!blockedUsers.length ? (
            <EmptyState title="No blocked users" message="Accounts you block from profiles or connections will appear here." />
          ) : (
            <div className="space-y-2">
              {blockedUsers.map((userId) => (
                <div key={userId} className="flex items-center justify-between rounded-2xl bg-slate-50 px-3 py-2">
                  <span className="truncate text-sm font-bold text-slate-700">{userId}</span>
                  <button type="button" onClick={() => safety.unblockUser(userId)} className="text-sm font-black text-sky-700">
                    Unblock
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>

        <PrivacySection title="Data permissions" description="Review optional device access and understand how each permission is used.">
          <button type="button" onClick={onOpenPermissions} className="flex items-start gap-3 rounded-[24px] border border-slate-200 bg-white p-4 text-left shadow-sm">
            <span className="grid h-12 w-12 flex-none place-items-center rounded-2xl bg-sky-50 text-sky-700"><HiOutlineCircleStack className="text-2xl" /></span>
            <span><span className="block text-base font-black text-slate-950">Review permissions</span><span className="mt-1 block text-sm font-semibold leading-6 text-slate-500">Camera, microphone, optional location, notifications, and contact access status.</span></span>
          </button>
        </PrivacySection>

        <PrivacySection title={t("privacy.yourDataTitle")} description={t("privacy.yourDataSubtitle")}>
          <button
            type="button"
            onClick={handleDataExport}
            disabled={exportState.busy}
            className="flex items-start gap-3 rounded-[24px] border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:border-sky-300 disabled:opacity-75"
          >
            <span className="grid h-12 w-12 flex-none place-items-center rounded-2xl bg-sky-50 text-sky-700"><HiOutlineArrowDownTray className="text-2xl" /></span>
            <span>
              <span className="block text-base font-black text-slate-950">{t("privacy.downloadTitle")}</span>
              <span className="mt-1 block text-sm font-semibold leading-6 text-slate-500">
                {t("privacy.downloadSubtitle")}
              </span>
              {exportState.busy ? (
                <span className="mt-2 inline-flex rounded-full bg-sky-50 px-2.5 py-1 text-[11px] font-black text-sky-700">{exportState.step}</span>
              ) : null}
            </span>
          </button>
          <button
            type="button"
            onClick={() => setConfirmAction("deactivate")}
            className="flex items-start gap-3 rounded-[24px] border border-amber-200 bg-amber-50 p-4 text-left shadow-sm transition hover:border-amber-300"
          >
            <span className="grid h-12 w-12 flex-none place-items-center rounded-2xl bg-white text-amber-700"><HiOutlinePauseCircle className="text-2xl" /></span>
            <span>
              <span className="block text-base font-black text-amber-950">{deactivatedAt ? t("privacy.reactivateTitle") : t("privacy.deactivateTitle")}</span>
              <span className="mt-1 block text-sm font-semibold leading-6 text-amber-700">
                {deactivatedAt ? t("privacy.reactivateSubtitle") : t("privacy.deactivateSubtitle")}
              </span>
              {deactivatedAt ? (
                <span className="mt-2 inline-flex rounded-full bg-white px-2.5 py-1 text-[11px] font-black text-amber-700">Deactivated</span>
              ) : null}
            </span>
          </button>
          <button
            type="button"
            onClick={() => setConfirmAction("delete")}
            className="flex items-start gap-3 rounded-[24px] border border-rose-200 bg-rose-50 p-4 text-left shadow-sm transition hover:border-rose-300"
          >
            <span className="grid h-12 w-12 flex-none place-items-center rounded-2xl bg-white text-rose-700"><HiOutlineTrash className="text-2xl" /></span>
            <span>
              <span className="block text-base font-black text-rose-950">{t("privacy.deleteTitle")}</span>
              <span className="mt-1 block text-sm font-semibold leading-6 text-rose-700">{t("privacy.deleteSubtitle")}</span>
            </span>
          </button>
        </PrivacySection>
      </div>

      {confirmAction ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 px-4 py-6" role="presentation">
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="account-action-title"
            className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl"
          >
            <div className={`flex h-12 w-12 items-center justify-center rounded-xl ${confirmAction === "delete" ? "bg-rose-50 text-rose-700" : "bg-amber-50 text-amber-700"}`}>
              {confirmAction === "delete" ? <HiOutlineTrash className="text-2xl" /> : <HiOutlinePauseCircle className="text-2xl" />}
            </div>
            <h2 id="account-action-title" className="mt-4 text-2xl font-black text-slate-950">
              {confirmAction === "delete"
                ? "Delete your account?"
                : deactivatedAt
                  ? "Reactivate your account?"
                  : "Deactivate your account?"}
            </h2>
            <p className="mt-3 text-sm font-semibold leading-6 text-slate-600">
              {confirmAction === "delete"
                ? "This permanently deletes your login, profile, posts, messages, and activity across Explore, UrMall, and Transport. There is no recovery once it completes."
                : deactivatedAt
                  ? "Your profile becomes visible in search and to other users again immediately."
                  : "Your profile is hidden from search and other users see “Account unavailable” instead. Nothing is deleted, and you can reactivate here at any time."}
            </p>
            <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setConfirmAction(null)}
                disabled={accountActionBusy}
                className="rounded-xl border border-slate-300 px-4 py-3 text-sm font-black text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmAction === "delete" ? handleDeleteConfirm : handleDeactivateConfirm}
                disabled={accountActionBusy}
                className={`rounded-xl px-4 py-3 text-sm font-black text-white transition disabled:opacity-60 ${confirmAction === "delete" ? "bg-rose-600 hover:bg-rose-700" : "bg-amber-600 hover:bg-amber-700"}`}
              >
                {accountActionBusy
                  ? "Working..."
                  : confirmAction === "delete"
                    ? "Delete my account permanently"
                    : deactivatedAt
                      ? "Reactivate account"
                      : "Deactivate account"}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}
