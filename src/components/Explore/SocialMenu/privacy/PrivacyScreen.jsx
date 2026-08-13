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
import { t as i18nText } from "../../../../i18n/index";

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
        showToast(i18nText("ui.literals.k2bcda242c49f"), "success");
      } else {
        await setAccountDeactivated(true);
        setDeactivatedAt(new Date().toISOString());
        showToast(i18nText("ui.literals.kacb70498f4c0"), "success");
      }
      setConfirmAction(null);
    } catch (error) {
      showToast(error.message || i18nText("ui.literals.k078af38fd646"), "danger");
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
      showToast(error.message || i18nText("ui.literals.k49c6cc37553d"), "danger");
      setAccountActionBusy(false);
    }
  }

  return (
    <div>
      {!hideHeader ? <SocialScreenHeader title={i18nText("ui.literals.k8a88f051eace")} subtitle={i18nText("ui.literals.kcc99607b778a")} /> : null}

      <div className="w-full space-y-6 px-4 py-4 sm:px-6 lg:px-8">
        <div className="rounded-[26px] border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-sky-700">{i18nText("ui.literals.k8a88f051eace")}</p>
          <h3 className="mt-1 text-2xl font-black text-slate-950">{i18nText("ui.literals.k93bfda2b33fa")}</h3>
          <p className="mt-2 max-w-3xl text-base font-semibold leading-7 text-slate-600">{i18nText("ui.literals.k5f9180c9af34")}</p>
          {safety.feedback ? <p className="mt-3 text-sm font-black text-sky-700">{safety.feedback}</p> : null}
        </div>

        <PrivacySection title={i18nText("ui.literals.k091d4c78276b")} description={i18nText("ui.literals.k8f05835c1467")}>
          <SettingRow icon={HiOutlineEye} title={i18nText("ui.literals.k40f6f2e90515")} description={i18nText("ui.literals.k08da3d6bd599")}>
            <select
              value={settings.defaultPostPrivacy}
              onChange={(event) => safety.updatePrivacySettings({ defaultPostPrivacy: event.target.value })}
              className="h-11 rounded-2xl bg-slate-100 px-4 text-sm font-black text-slate-700 outline-none"
            >
              <option value="public">{i18nText("ui.literals.kdc5eb704bbca")}</option>
              <option value="circle">{i18nText("ui.literals.k1cc7820a08e2")}</option>
              <option value="private">{i18nText("ui.literals.k237dfa0a21c8")}</option>
            </select>
          </SettingRow>

          <SettingRow icon={HiOutlineChatBubbleLeftRight} title={i18nText("ui.literals.k51515a6a5a92")} description={i18nText("ui.literals.keb2f97b117bc")}>
            <select
              value={settings.allowMessages}
              onChange={(event) => safety.updatePrivacySettings({ allowMessages: event.target.value })}
              className="h-11 rounded-2xl bg-slate-100 px-4 text-sm font-black text-slate-700 outline-none"
            >
              <option value="everyone">{i18nText("ui.literals.kc756f6af1f03")}</option>
              <option value="followers">{i18nText("ui.literals.k8f3509b64e0e")}</option>
              <option value="none">{i18nText("ui.literals.k41c06c15c761")}</option>
            </select>
          </SettingRow>
        </PrivacySection>

        <PrivacySection title={i18nText("ui.literals.k8a4c2de98d1f")} description={i18nText("ui.literals.k6c764d158a93")}>
          <SettingRow icon={HiOutlineShieldCheck} title={i18nText("ui.literals.k85e12bc6f2e5")} description={i18nText("ui.literals.kd2efa777d4a8")}>
            <button
              type="button"
              onClick={() => safety.updatePrivacySettings({ allowMentions: !settings.allowMentions })}
              className={`h-11 rounded-2xl px-4 text-sm font-black ${settings.allowMentions ? "bg-sky-700 text-white" : "bg-slate-100 text-slate-600"}`}
            >
              {settings.allowMentions ? i18nText("ui.literals.k77c7b4909d39") : i18nText("ui.literals.ke3de5ab0ca4c")}
            </button>
          </SettingRow>

          <SettingRow icon={HiOutlineBolt} title={i18nText("ui.literals.k43c17b69d1b3")} description={i18nText("ui.literals.k98fdae836f80")}>
            <button
              type="button"
              onClick={() => safety.updatePrivacySettings({ showActivity: !settings.showActivity })}
              className={`h-11 rounded-2xl px-4 text-sm font-black ${settings.showActivity ? "bg-sky-700 text-white" : "bg-slate-100 text-slate-600"}`}
            >
              {settings.showActivity ? i18nText("ui.literals.k1fe59390acc1") : i18nText("ui.literals.kd4c2792a7245")}
            </button>
          </SettingRow>
        </PrivacySection>

        <PrivacySection title={i18nText("ui.literals.kadcb9ee56b82")} description={i18nText("ui.literals.k4d5bf0f625dd")}>
          <SettingRow icon={HiOutlineShieldCheck} title={i18nText("ui.literals.kf72d7a12b0bc")} description={i18nText("ui.literals.k94ff7b873940")}>
            <button
              type="button"
              onClick={() => safety.updatePrivacySettings({ filterSensitiveContent: !settings.filterSensitiveContent })}
              className={`h-11 rounded-2xl px-4 text-sm font-black ${settings.filterSensitiveContent ? "bg-sky-700 text-white" : "bg-slate-100 text-slate-600"}`}
            >
              {settings.filterSensitiveContent ? i18nText("ui.literals.ke0049a66519c") : i18nText("ui.literals.ke3de5ab0ca4c")}
            </button>
          </SettingRow>
        </PrivacySection>

        <section className="rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center gap-2">
            <HiOutlineUserMinus className="text-xl text-rose-600" />
            <h3 className="text-base font-black text-slate-950">{i18nText("ui.literals.k80a67a2e8dba")}</h3>
          </div>
          {!blockedUsers.length ? (
            <EmptyState title={i18nText("ui.literals.k647401e7b5bc")} message={i18nText("ui.literals.kaadf01de5edd")} />
          ) : (
            <div className="space-y-2">
              {blockedUsers.map((userId) => (
                <div key={userId} className="flex items-center justify-between rounded-2xl bg-slate-50 px-3 py-2">
                  <span className="truncate text-sm font-bold text-slate-700">{userId}</span>
                  <button type="button" onClick={() => safety.unblockUser(userId)} className="text-sm font-black text-sky-700">
                    {i18nText("ui.literals.k12aabd251c42")}
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>

        <PrivacySection title={i18nText("ui.literals.k16d8c526323a")} description={i18nText("ui.literals.k1d1e01daac94")}>
          <button type="button" onClick={onOpenPermissions} className="flex items-start gap-3 rounded-[24px] border border-slate-200 bg-white p-4 text-left shadow-sm">
            <span className="grid h-12 w-12 flex-none place-items-center rounded-2xl bg-sky-50 text-sky-700"><HiOutlineCircleStack className="text-2xl" /></span>
            <span><span className="block text-base font-black text-slate-950">{i18nText("ui.literals.kdee17ecaf273")}</span><span className="mt-1 block text-sm font-semibold leading-6 text-slate-500">{i18nText("ui.literals.k591b7f98d731")}</span></span>
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
                <span className="mt-2 inline-flex rounded-full bg-white px-2.5 py-1 text-[11px] font-black text-amber-700">{i18nText("ui.literals.k314a1adcc8b5")}</span>
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
                ? t("privacy.confirmDeleteTitle")
                : deactivatedAt
                  ? t("privacy.confirmReactivateTitle")
                  : t("privacy.confirmDeactivateTitle")}
            </h2>
            <p className="mt-3 text-sm font-semibold leading-6 text-slate-600">
              {confirmAction === "delete"
                ? t("privacy.confirmDeleteBody")
                : deactivatedAt
                  ? t("privacy.confirmReactivateBody")
                  : t("privacy.confirmDeactivateBody")}
            </p>
            <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setConfirmAction(null)}
                disabled={accountActionBusy}
                className="rounded-xl border border-slate-300 px-4 py-3 text-sm font-black text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
              >
                {t("common.cancel")}
              </button>
              <button
                type="button"
                onClick={confirmAction === "delete" ? handleDeleteConfirm : handleDeactivateConfirm}
                disabled={accountActionBusy}
                className={`rounded-xl px-4 py-3 text-sm font-black text-white transition disabled:opacity-60 ${confirmAction === "delete" ? "bg-rose-600 hover:bg-rose-700" : "bg-amber-600 hover:bg-amber-700"}`}
              >
                {accountActionBusy
                  ? t("common.working")
                  : confirmAction === "delete"
                    ? t("privacy.confirmDeleteAction")
                    : deactivatedAt
                      ? t("privacy.reactivateTitle")
                      : t("privacy.deactivateTitle")}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}
