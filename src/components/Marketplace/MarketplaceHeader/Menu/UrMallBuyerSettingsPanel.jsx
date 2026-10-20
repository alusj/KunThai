import { useState } from "react";
import { Settings, Trash2 } from "lucide-react";

import { showToast } from "../../../../Backend/services/toastService";
import {
  clearUrMallShoppingActivity,
  getUrMallBuyerSettings,
  saveUrMallBuyerSettings,
} from "../../../../Backend/services/marketplace/marketplaceBuyerSettings";
import { NotificationsEntryRow } from "../../../shared/notifications/NotificationSettingsScreen";
import { resetBuyerInterestCache } from "../../../../Backend/services/marketplace/buyerInterestService";
import { useI18n } from "../../../../i18n";

// UrMall menu > Settings: personalisation, and a Notifications row that opens
// the one screen with every alert switch (orders, messages, store updates,
// Explore and UrRide too). Every change saves at once and confirms with a
// toast (which also vibrates).
export default function UrMallBuyerSettingsPanel() {
  const { t } = useI18n();
  const [settings, setSettings] = useState(getUrMallBuyerSettings);
  const [clearing, setClearing] = useState(false);

  function toggleLocal(key) {
    const next = !settings[key];
    setSettings(saveUrMallBuyerSettings({ [key]: next }));
    const tone = next ? "success" : "info";
    if (key === "personalizedSuggestions") showToast(next ? t("urmallSettings.personalizedOn") : t("urmallSettings.personalizedOff"), tone);
  }

  async function clearActivity() {
    if (clearing) return;
    setClearing(true);
    try {
      await clearUrMallShoppingActivity();
      resetBuyerInterestCache();
      showToast(t("urmallSettings.activityCleared"), "success");
    } catch {
      showToast(t("urmallSettings.saveFailed"), "danger");
    } finally {
      setClearing(false);
    }
  }

  return (
    <section className="rounded-3xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-emerald-50 text-emerald-700">
          <Settings size={20} />
        </span>
        <div className="min-w-0">
          <h3 className="text-base font-black text-gray-950">{t("urmallSettings.title")}</h3>
          <p className="mt-1 text-sm font-semibold leading-6 text-gray-500">{t("urmallSettings.body")}</p>
        </div>
      </div>

      <div className="mt-4 grid gap-3">
        <NotificationsEntryRow sector="urmall" />
        <SettingSwitch
          label={t("urmallSettings.personalized")}
          description={t("urmallSettings.personalizedDesc")}
          checked={settings.personalizedSuggestions}
          onChange={() => toggleLocal("personalizedSuggestions")}
        />
      </div>

      <button
        type="button"
        onClick={clearActivity}
        disabled={clearing}
        className="kt-pressable mt-4 flex w-full items-center gap-3 rounded-2xl border border-rose-100 bg-rose-50 px-3 py-3 text-left disabled:opacity-60"
      >
        <Trash2 size={18} className="shrink-0 text-rose-600" />
        <span className="min-w-0">
          <span className="block text-sm font-black text-rose-700">{t("urmallSettings.clearActivity")}</span>
          <span className="mt-0.5 block text-xs font-semibold leading-5 text-rose-600/80">{t("urmallSettings.clearActivityDesc")}</span>
        </span>
      </button>
    </section>
  );
}

function SettingSwitch({ label, description, checked, busy = false, onChange }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-xl bg-gray-50 px-3 py-3">
      <div className="min-w-0">
        <p className="text-sm font-black text-gray-950">{label}</p>
        <p className="mt-0.5 text-xs font-semibold leading-5 text-gray-500">{description}</p>
      </div>
      <button
        type="button"
        aria-pressed={Boolean(checked)}
        aria-label={label}
        aria-busy={busy || undefined}
        disabled={busy}
        onClick={onChange}
        className={`relative h-8 w-14 shrink-0 rounded-full border transition disabled:opacity-70 ${
          checked ? "border-emerald-500 bg-emerald-600" : "border-gray-300 bg-gray-200"
        }`}
      >
        <span className={`absolute top-1 h-6 w-6 rounded-full bg-white shadow transition ${checked ? "left-7" : "left-1"}`} />
      </button>
    </div>
  );
}
