import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Bell, ChevronLeft, ChevronRight, Compass, ShoppingBag, Smartphone, Truck } from "lucide-react";

import supabase from "../../../Backend/lib/supabaseClient";
import { useExplorePreferences } from "../../../Backend/hooks/useExplorePreferences";
import { disablePushNotifications, enablePushNotifications, getPushProblemMessage, getPushStatus } from "../../../Backend/services/pushService";
import { fetchUnifiedNotificationPreferences, saveUnifiedNotificationPreferences } from "../../../Backend/services/unifiedNotificationService";
import {
  fetchStoreUpdatesEnabled,
  getUrMallBuyerSettings,
  saveStoreUpdatesEnabled,
  saveUrMallBuyerSettings,
} from "../../../Backend/services/marketplace/marketplaceBuyerSettings";
import { getTransportPassengerSettings, saveTransportPassengerSettings } from "../../services/passengerTransportService";
import { showToast } from "../../../Backend/services/toastService";
import { shortErrorToast } from "../../../Backend/services/friendlyErrorService";
import { isNativePlatform } from "../../../Backend/services/nativeOAuthService";
import NotificationSettings from "../../Explore/ExploreTabs/notification/components/NotificationSettings";
import { NAV_TRANSITION_MS, navMotionClass } from "../navigationMotion";
import { t, useI18n } from "../../../i18n";
import { t as i18nText } from "../../../i18n/index";

// Each department's notifications on their own screen: Explore's settings
// open Explore's, UrMall's open UrMall's, UrRide's open UrRide's. Every screen
// also shows "This phone" (push, pop-ups, offers), which apply to the whole
// account. A department's settings shows one "Notifications" row
// (NotificationsEntryRow sector=...) that pushes its screen in.

const SECTORS = {
  explore: { title: "Explore", detailKey: "ui.literals.kc7051bb552ad" },
  urmall: { title: "UrMall", detailKey: "ui.literals.k72031de60614" },
  urride: { title: "UrRide", detailKey: "ui.literals.kbd7e2fe89726" },
};

const UNIFIED_DEFAULTS = {
  floating_enabled: true,
  push_enabled: false,
  social_enabled: true,
  commerce_enabled: true,
  transport_enabled: true,
  marketing_enabled: true,
};

async function currentUserId() {
  const { data } = await supabase.auth.getUser();
  return data?.user?.id || "";
}

function Switch({ checked, busy = false, label, onChange }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={Boolean(checked)}
      aria-label={label}
      aria-busy={busy || undefined}
      disabled={busy}
      onClick={() => onChange(!checked)}
      className={`relative h-7 w-12 shrink-0 rounded-full transition-colors disabled:opacity-60 ${checked ? "bg-emerald-600" : "bg-slate-300"}`}
    >
      <span className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-all ${checked ? "left-6" : "left-1"}`} />
    </button>
  );
}

function Row({ label, detail, checked, busy, onChange, children }) {
  return (
    <div className="flex items-center justify-between gap-4 px-4 py-3">
      <div className="min-w-0">
        <p className="text-sm font-black text-slate-950">{label}</p>
        {detail ? <p className="mt-0.5 text-xs font-semibold leading-5 text-slate-500">{detail}</p> : null}
        {children}
      </div>
      <Switch checked={checked} busy={busy} label={label} onChange={onChange} />
    </div>
  );
}

function Section({ icon: Icon, title, children }) {
  return (
    <section className="space-y-2">
      <h2 className="flex items-center gap-2 px-1 text-xs font-black uppercase tracking-[0.14em] text-slate-500">
        <Icon size={14} aria-hidden="true" />
        {title}
      </h2>
      <div className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        {children}
      </div>
    </section>
  );
}

function NotificationSettingsContent({ sector = "explore" }) {
  useI18n();
  const nativeApp = isNativePlatform();
  const { settings: exploreSettings, updateSection } = useExplorePreferences();
  const [unified, setUnified] = useState(UNIFIED_DEFAULTS);
  const [savingKey, setSavingKey] = useState("");
  const [pushStatus, setPushStatus] = useState("loading");
  const [pushError, setPushError] = useState("");
  const [urmall, setUrmall] = useState(() => getUrMallBuyerSettings());
  const [storeUpdates, setStoreUpdates] = useState(true);
  const [urride, setUrride] = useState(() => getTransportPassengerSettings());

  useEffect(() => {
    let alive = true;
    getPushStatus().then((status) => {
      if (!alive) return;
      setPushStatus(status);
      if (status !== "enabled") setPushError(getPushProblemMessage());
    });
    currentUserId()
      .then((userId) => (userId ? fetchUnifiedNotificationPreferences(userId) : null))
      .then((preferences) => {
        if (alive && preferences) setUnified((current) => ({ ...current, ...preferences }));
      })
      .catch(() => {});
    fetchStoreUpdatesEnabled().then((enabled) => {
      if (alive) setStoreUpdates(enabled);
    }).catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  async function setUnifiedKey(key, value) {
    const previous = unified[key];
    setUnified((current) => ({ ...current, [key]: value }));
    setSavingKey(key);
    try {
      const userId = await currentUserId();
      if (userId) await saveUnifiedNotificationPreferences(userId, { [key]: value });
    } catch (error) {
      setUnified((current) => ({ ...current, [key]: previous }));
      showToast(shortErrorToast(error, t("urmallSettings.saveFailed")), "danger");
    } finally {
      setSavingKey("");
    }
  }

  async function togglePush() {
    if (savingKey === "push" || ["unsupported", "loading"].includes(pushStatus)) return;
    setSavingKey("push");
    setPushError("");
    try {
      const next = pushStatus === "enabled" ? await disablePushNotifications() : await enablePushNotifications();
      const userId = await currentUserId();
      if (userId) await saveUnifiedNotificationPreferences(userId, { push_enabled: next === "enabled" });
      setPushStatus(next);
    } catch (error) {
      showToast(shortErrorToast(error, "Push alerts not updated"), "danger");
      if (nativeApp && error?.message) setPushError(error.message);
      setPushStatus(await getPushStatus());
    } finally {
      setSavingKey("");
    }
  }

  async function toggleStoreUpdates(next) {
    setStoreUpdates(next);
    setSavingKey("storeUpdates");
    try {
      await saveStoreUpdatesEnabled(next);
    } catch {
      setStoreUpdates(!next);
      showToast(t("urmallSettings.saveFailed"), "danger");
    } finally {
      setSavingKey("");
    }
  }

  const exploreAlerts = exploreSettings?.notifications || {};

  return (
    <div className="space-y-6">

      {sector === "explore" ? (
      <Section icon={Compass} title="Explore">
        <Row
          label={i18nText("ui.literals.k3d7f7c2bc3d1")}
          detail={i18nText("ui.literals.kc7051bb552ad")}
          checked={unified.social_enabled !== false}
          busy={savingKey === "social_enabled"}
          onChange={(value) => setUnifiedKey("social_enabled", value)}
        />
        {unified.social_enabled !== false ? (
          <div className="px-3 py-3">
            <p className="px-1 pb-2 text-xs font-black uppercase tracking-wide text-slate-400">{t("notificationHub.alertTypes")}</p>
            <NotificationSettings
              values={exploreAlerts}
              onToggle={(key) => updateSection("notifications", { [key]: exploreAlerts[key] === false })}
            />
          </div>
        ) : null}
      </Section>
      ) : null}

      {sector === "urmall" ? (
      <Section icon={ShoppingBag} title="UrMall">
        <Row
          label={i18nText("ui.literals.kc68a9a0d51ff")}
          detail={i18nText("ui.literals.k72031de60614")}
          checked={unified.commerce_enabled !== false}
          busy={savingKey === "commerce_enabled"}
          onChange={(value) => setUnifiedKey("commerce_enabled", value)}
        />
        {unified.commerce_enabled !== false ? (
          <>
            <Row
              label={t("urmallSettings.orderAlerts")}
              detail={t("urmallSettings.orderAlertsDesc")}
              checked={Boolean(urmall.orderAlerts)}
              onChange={(value) => setUrmall(saveUrMallBuyerSettings({ orderAlerts: value }))}
            />
            <Row
              label={t("urmallSettings.messageAlerts")}
              detail={t("urmallSettings.messageAlertsDesc")}
              checked={Boolean(urmall.messageAlerts)}
              onChange={(value) => setUrmall(saveUrMallBuyerSettings({ messageAlerts: value }))}
            />
            <Row
              label={t("urmallSettings.storeUpdates")}
              detail={t("urmallSettings.storeUpdatesDesc")}
              checked={storeUpdates}
              busy={savingKey === "storeUpdates"}
              onChange={toggleStoreUpdates}
            />
          </>
        ) : null}
      </Section>
      ) : null}

      {sector === "urride" ? (
      <Section icon={Truck} title="UrRide">
        <Row
          label={i18nText("ui.literals.k84b196d91543")}
          detail={i18nText("ui.literals.kbd7e2fe89726")}
          checked={unified.transport_enabled !== false}
          busy={savingKey === "transport_enabled"}
          onChange={(value) => setUnifiedKey("transport_enabled", value)}
        />
        {unified.transport_enabled !== false ? (
          <>
            <Row
              label={t("urride.menu.settings.tripAlerts")}
              detail={t("urride.menu.settings.tripAlertsDesc")}
              checked={Boolean(urride.tripAlerts)}
              onChange={(value) => setUrride(saveTransportPassengerSettings({ tripAlerts: value }))}
            />
            <Row
              label={t("urride.menu.settings.safetyReminders")}
              detail={t("urride.menu.settings.safetyRemindersDesc")}
              checked={Boolean(urride.safetyReminders)}
              onChange={(value) => setUrride(saveTransportPassengerSettings({ safetyReminders: value }))}
            />
            <Row
              label={t("urride.menu.settings.nearby")}
              detail={t("urride.menu.settings.nearbyDesc")}
              checked={Boolean(urride.nearbyOperators)}
              onChange={(value) => setUrride(saveTransportPassengerSettings({ nearbyOperators: value }))}
            />
            <Row
              label={t("urride.menu.settings.savedSuggestions")}
              detail={t("urride.menu.settings.savedSuggestionsDesc")}
              checked={Boolean(urride.savedPlaceSuggestions)}
              onChange={(value) => setUrride(saveTransportPassengerSettings({ savedPlaceSuggestions: value }))}
            />
          </>
        ) : null}
      </Section>
      ) : null}

      <Section icon={Smartphone} title={t("notificationHub.thisPhone")}>
        <Row
          label={t("settings.pushTitle")}
          detail={pushStatus === "unsupported" ? t("settings.pushUnsupported") : pushStatus === "denied" ? (nativeApp ? t("exploreNativeFix.pushDeniedNative") : t("settings.pushDenied")) : ""}
          checked={pushStatus === "enabled"}
          busy={savingKey === "push" || pushStatus === "loading"}
          onChange={togglePush}
        >
          {pushError ? <p className="mt-1 text-xs font-bold leading-5 text-amber-700" role="alert">{pushError}</p> : null}
        </Row>
        <Row
          label={i18nText("ui.literals.ke0ceab8e8e66")}
          detail={i18nText("ui.literals.k372ceadbfaa7")}
          checked={unified.floating_enabled !== false}
          busy={savingKey === "floating_enabled"}
          onChange={(value) => setUnifiedKey("floating_enabled", value)}
        />
        <Row
          label={i18nText("ui.literals.kcfaf378f96ff")}
          detail={i18nText("ui.literals.k66a394272326")}
          checked={unified.marketing_enabled !== false}
          busy={savingKey === "marketing_enabled"}
          onChange={(value) => setUnifiedKey("marketing_enabled", value)}
        />
      </Section>
    </div>
  );
}

// The full-screen Notifications screen: pushed in from the right, popped out
// to the right on back (the KunThai navigation, navigationMotion.js).
export default function NotificationSettingsScreen({ open, onClose, sector = "explore" }) {
  useI18n();
  const [rendered, setRendered] = useState(open);
  const [closing, setClosing] = useState(false);
  const timerRef = useRef(null);

  useEffect(() => {
    window.clearTimeout(timerRef.current);
    if (open) {
      setRendered(true);
      setClosing(false);
      return undefined;
    }
    if (!rendered) return undefined;
    setClosing(true);
    timerRef.current = window.setTimeout(() => {
      setRendered(false);
      setClosing(false);
    }, NAV_TRANSITION_MS);
    return () => window.clearTimeout(timerRef.current);
    // `rendered` is read only to decide whether a close animation is needed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!rendered || typeof document === "undefined") return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t("settings.notificationsTitle")}
      className={`${closing ? navMotionClass.pop : navMotionClass.push} kt-mobile-screen kt-safe-screen fixed inset-0 z-[1250] flex flex-col bg-slate-50`}
      data-back-swipe-scope
    >
      <header className="flex shrink-0 items-center gap-2 border-b border-slate-200 bg-white px-2 py-2">
        <button
          type="button"
          onClick={onClose}
          aria-label={i18nText("ui.literals.kb52b36b7269f")}
          className="kt-touchable flex h-11 w-11 items-center justify-center rounded-full text-slate-800"
        >
          <ChevronLeft size={26} />
        </button>
        <div className="min-w-0">
          <p className="text-[11px] font-black uppercase tracking-[0.14em] text-emerald-700">{(SECTORS[sector] || SECTORS.explore).title}</p>
          <h1 className="text-lg font-black leading-tight text-slate-950">{t("settings.notificationsTitle")}</h1>
        </div>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-5 kt-safe-scroll-bottom">
        <NotificationSettingsContent sector={sector} />
      </div>
    </div>,
    document.body,
  );
}

// The single "Notifications ›" row a department's settings shows; it opens
// that department's notifications only.
export function NotificationsEntryRow({ className = "", sector = "explore" }) {
  useI18n();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`kt-pressable flex w-full items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-left shadow-sm ${className}`}
      >
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-emerald-50 text-emerald-700">
          <Bell size={19} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-black text-slate-950">{t("settings.notificationsTitle")}</span>
          <span className="mt-0.5 block text-xs font-semibold leading-5 text-slate-500">{i18nText((SECTORS[sector] || SECTORS.explore).detailKey)}</span>
        </span>
        <ChevronRight size={18} className="shrink-0 text-slate-400" />
      </button>
      <NotificationSettingsScreen open={open} sector={sector} onClose={() => setOpen(false)} />
    </>
  );
}
