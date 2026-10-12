import { createElement, useEffect, useState } from "react";
import {
  HiOutlineBellAlert,
  HiOutlineChatBubbleLeftRight,
  HiOutlineCircleStack,
  HiOutlineComputerDesktop,
  HiOutlineCog6Tooth,
  HiOutlineFilm,
  HiOutlineKey,
  HiOutlineLanguage,
  HiOutlineDevicePhoneMobile,
  HiOutlineHome,
  HiOutlineRectangleStack,
  HiOutlineSignal,
  HiOutlineShieldCheck,
  HiOutlineSparkles,
} from "react-icons/hi2";

import { useExplorePreferences } from "../../../../Backend/hooks/useExplorePreferences";
import { readDefaultMainPage, setDefaultMainPage } from "../../../../Backend/services/mainDashboardPreference";
import { haptics, sounds } from "../../../../Backend/services/feedbackService";
import { disablePushNotifications, enablePushNotifications, getPushStatus } from "../../../../Backend/services/pushService";
import { showToast } from "../../../../Backend/services/toastService";
import supabase from "../../../../Backend/lib/supabaseClient";
import { saveUnifiedNotificationPreferences } from "../../../../Backend/services/unifiedNotificationService";
import NotificationSettings from "../../ExploreTabs/notification/components/NotificationSettings";
import { signOutSocialSession } from "../../../../Backend/services/sessionService";
import { useAppearanceMode } from "../../../../contexts/appearanceContext";
import { useI18n } from "../../../../i18n";
import SocialScreenHeader from "../shared/SocialScreenHeader";
import TwoFactorSection from "./TwoFactorSection";
import CountryRegionSettings from "../../../shared/regions/CountryRegionSettings";
import AccountTypeSettings from "../../../shared/AccountTypeSettings";
import { t as i18nText } from "../../../../i18n/index";
import { uiText as translateUi, useI18n as useUiLocale } from "../../../../i18n/index.js";
import { shortErrorToast } from "../../../../Backend/services/friendlyErrorService";
import { isNativePlatform } from "../../../../Backend/services/nativeOAuthService";

function Toggle({ active, label, onChange }) {
  useUiLocale();
  return (
    <button
      type="button"
      onClick={() => onChange(!active)}
      className={`flex h-11 min-w-24 items-center justify-center rounded-2xl px-4 text-sm font-black transition ${
        active ? "bg-sky-700 text-white" : "bg-slate-100 text-slate-600"
      }`}
    >
      {label || (active ? i18nText("ui.literals.ke0049a66519c") : i18nText("ui.literals.ke3de5ab0ca4c"))}
    </button>
  );
}

function SelectControl({ value, onChange, options }) {
  useUiLocale();
  return (
    <select
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className="h-11 rounded-2xl bg-slate-100 px-4 text-sm font-black text-slate-700 outline-none"
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {translateUi(option.label)}
        </option>
      ))}
    </select>
  );
}

function SettingRow({ children, description, icon, title }) {
  useUiLocale();
  return (
    <div className="flex flex-col gap-4 rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-start gap-3">
        <span className="flex h-12 w-12 flex-none items-center justify-center rounded-2xl bg-sky-50 text-sky-700">
          {createElement(icon, { className: "text-2xl" })}
        </span>
        <div className="min-w-0">
          <p className="text-base font-black text-slate-950">{translateUi(title)}</p>
          <p className="mt-1 text-sm font-semibold leading-6 text-slate-500">{translateUi(description)}</p>
        </div>
      </div>
      <div className="flex flex-none flex-wrap gap-2 sm:justify-end">{children}</div>
    </div>
  );
}

function SettingsSection({ children, subtitle, title }) {
  useUiLocale();
  return (
    <section className="space-y-3">
      <div>
        <p className="text-xs font-black uppercase tracking-[0.2em] text-sky-700">{translateUi(title)}</p>
        {subtitle ? <p className="mt-1 text-sm font-semibold text-slate-500">{translateUi(subtitle)}</p> : null}
      </div>
      <div className="grid gap-3">{children}</div>
    </section>
  );
}

export default function SettingsScreen({ hideHeader = false, onOpenDataMobile, onOpenInterests, onOpenPermissions, onOpenPrivacy, onOpenSecurity, onSwitchAccount }) {
  const { clearCache, feedback, settings, updateSection } = useExplorePreferences();
  const { mode: appearanceMode, resolvedMode, setMode: setAppearanceMode } = useAppearanceMode();
  const i18n = useI18n();
  const { notifications, video, feed, messages, feedbackFx } = settings;
  const [pushStatus, setPushStatus] = useState("loading");
  const [pushBusy, setPushBusy] = useState(false);
  const [pushError, setPushError] = useState("");
  const nativeApp = isNativePlatform();
  const [defaultDashboard, setDefaultDashboard] = useState(() => readDefaultMainPage() || "auto");

  const [signOutBusy, setSignOutBusy] = useState("");
  const [confirmSignOutAll, setConfirmSignOutAll] = useState(false);
  const vibrationSupported = typeof navigator !== "undefined" && typeof navigator.vibrate === "function";

  async function handleSignOut(allDevices) {
    if (signOutBusy) return;
    setSignOutBusy(allDevices ? "all" : "this");
    try {
      await signOutSocialSession({ allDevices });
      if (allDevices) {
        showToast("Signed out everywhere", "success");
      }
    } catch (error) {
      showToast(shortErrorToast(error, i18n.t("settings.toastSignOutError")), "danger");
    } finally {
      setSignOutBusy("");
      setConfirmSignOutAll(false);
    }
  }

  useEffect(() => {
    let active = true;
    getPushStatus().then((status) => {
      if (active) setPushStatus(status);
    });
    return () => {
      active = false;
    };
  }, []);

  async function togglePushNotifications() {
    if (pushBusy || ["unsupported", "loading"].includes(pushStatus)) return;
    setPushBusy(true);
    setPushError("");
    try {
      const next = pushStatus === "enabled" ? await disablePushNotifications() : await enablePushNotifications();
      // Delivery also checks the account's push preference (as in the
      // notification center), so both switches move together.
      const { data } = await supabase.auth.getUser();
      if (data?.user?.id) {
        await saveUnifiedNotificationPreferences(data.user.id, { push_enabled: next === "enabled" });
      }
      setPushStatus(next);
      showToast(next === "enabled" ? "Push alerts are on" : "Push alerts are off", "success");
    } catch (error) {
      showToast(shortErrorToast(error, "Push alerts not updated"), "danger");
      // In the app the reason is worth reading in full (permission off, or
      // this build has no push set up yet), so it stays under the switch.
      if (nativeApp && error?.message) setPushError(error.message);
      setPushStatus(await getPushStatus());
    } finally {
      setPushBusy(false);
    }
  }

  function testFeedback() {
    haptics.medium();
    sounds.success();
  }

  return (
    <div>
      {!hideHeader ? (
        <SocialScreenHeader title={i18n.t("screens.SettingsTitle")} subtitle={i18n.t("screens.SettingsSubtitle")} />
      ) : null}

      <div className="w-full space-y-6 px-4 py-4 sm:px-6 lg:px-8">
        <div className="rounded-[26px] border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-black uppercase tracking-[0.2em] text-sky-700">{i18n.t("settings.eyebrow")}</p>
          <h3 className="mt-1 text-2xl font-black text-slate-950">{i18n.t("settings.heading")}</h3>
          <p className="mt-2 max-w-3xl text-base font-semibold leading-7 text-slate-600">
            {i18n.t("settings.intro")}
          </p>
          {feedback ? <p className="mt-3 text-sm font-black text-sky-700">{translateUi(feedback)}</p> : null}
        </div>

        <SettingsSection title={i18n.t("settings.appearanceTitle")} subtitle={i18n.t("settings.appearanceSubtitle")}>
          <div className="rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
            <div className="flex items-start gap-3">
              <span className="grid h-12 w-12 flex-none place-items-center rounded-2xl bg-sky-50 text-sky-700"><HiOutlineComputerDesktop className="text-2xl" /></span>
              <div className="min-w-0">
                <p className="text-base font-black text-slate-950">{i18n.t("settings.appearanceName")}</p>
                <p className="mt-1 text-sm font-semibold leading-6 text-slate-500">{i18n.t("settings.appearanceDesc")}</p>
                <p className="mt-1 text-xs font-black uppercase tracking-[0.14em] text-sky-700">{i18n.t("settings.currently")} {resolvedMode}</p>
              </div>
            </div>
            <div className="mt-4">
              <SelectControl
                value={appearanceMode}
                onChange={setAppearanceMode}
                options={[
                  { value: "system", label: i18n.t("settings.modeSystem") },
                  { value: "on", label: i18n.t("settings.modeDark") },
                  { value: "off", label: i18n.t("settings.modeLight") },
                ]}
              />
            </div>
          </div>
        </SettingsSection>

        <SettingsSection title={i18n.t("language.title")} subtitle={i18n.t("language.subtitle")}>
          <div className="rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
            <div className="flex items-start gap-3">
              <span className="grid h-12 w-12 flex-none place-items-center rounded-2xl bg-sky-50 text-sky-700"><HiOutlineLanguage className="text-2xl" /></span>
              <div className="min-w-0">
                <p className="text-base font-black text-slate-950">{i18n.t("language.title")}</p>
                <p className="mt-1 text-sm font-semibold leading-6 text-slate-500">{i18n.t("language.subtitle")}</p>
              </div>
            </div>
            <div className="mt-4">
              <SelectControl
                value={i18n.override || "auto"}
                onChange={(value) => i18n.setLocaleOverride(value === "auto" ? "" : value)}
                options={[
                  { value: "auto", label: i18n.t("language.auto") },
                  ...i18n.localeOptions.map((option) => ({ value: option.code, label: option.label })),
                ]}
              />
            </div>
          </div>
        </SettingsSection>

        <SettingsSection title={translateUi("Country / Region")} subtitle={translateUi("Where you use KunThai")}>
          <CountryRegionSettings />
        </SettingsSection>

        <SettingsSection title={i18n.t("onboarding.profile.accountType")} subtitle={translateUi("Personal, Business or Both")}>
          <AccountTypeSettings />
        </SettingsSection>

        <SettingsSection title={i18n.t("settings.controlCenterTitle")} subtitle={i18n.t("settings.controlCenterSubtitle")}>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <SettingsShortcut icon={HiOutlineSparkles} title={i18n.t("settings.shortcutInterests")} description={i18n.t("settings.shortcutInterestsDesc")} onClick={onOpenInterests} />
            <SettingsShortcut icon={HiOutlineShieldCheck} title={i18n.t("settings.shortcutPrivacy")} description={i18n.t("settings.shortcutPrivacyDesc")} onClick={onOpenPrivacy} />
            <SettingsShortcut icon={HiOutlineKey} title={i18n.t("settings.shortcutSecurity")} description={i18n.t("settings.shortcutSecurityDesc")} onClick={onOpenSecurity} />
            <SettingsShortcut icon={HiOutlineDevicePhoneMobile} title={i18n.t("settings.shortcutPermissions")} description={i18n.t("settings.shortcutPermissionsDesc")} onClick={onOpenPermissions} />
            <SettingsShortcut icon={HiOutlineCircleStack} title={i18n.t("settings.shortcutData")} description={i18n.t("settings.shortcutDataDesc")} onClick={onOpenDataMobile} />
          </div>
        </SettingsSection>

        <div className="grid gap-6 xl:grid-cols-2">
          <SettingsSection title={i18n.t("settings.notificationsTitle")} subtitle={i18n.t("settings.notificationsSubtitle")}>
            <SettingRow
              icon={HiOutlineDevicePhoneMobile}
              title={i18n.t("settings.pushTitle")}
              description={
                pushStatus === "unsupported"
                  ? i18n.t("settings.pushUnsupported")
                  : pushStatus === "denied"
                    ? nativeApp ? i18n.t("exploreNativeFix.pushDeniedNative") : i18n.t("settings.pushDenied")
                    : nativeApp
                      ? i18n.t("exploreNativeFix.pushNativeDescription")
                      : i18n.t("exploreSettingsFix.pushAnnouncementsDesc")
              }
            >
              <Toggle
                active={pushStatus === "enabled"}
                label={pushBusy || pushStatus === "loading" ? "..." : pushStatus === "enabled" ? i18n.t("settings.on") : i18n.t("settings.off")}
                onChange={togglePushNotifications}
              />
            </SettingRow>
            {pushError ? (
              <p className="rounded-2xl bg-amber-50 px-4 py-3 text-sm font-bold leading-6 text-amber-800" role="alert">{pushError}</p>
            ) : null}
            {/* The same switches as the Notifications panel, so both places match. */}
            <div className="rounded-[24px] border border-slate-200 bg-white p-3 shadow-sm">
              <p className="px-1 pb-2 text-sm font-semibold leading-6 text-slate-500">{i18n.t("exploreSettingsFix.inAppAlertsDesc")}</p>
              <NotificationSettings
                values={notifications}
                onToggle={(key) => updateSection("notifications", { [key]: notifications[key] === false })}
              />
            </div>
          </SettingsSection>

          <SettingsSection title={i18n.t("settings.soundsTitle")} subtitle={i18n.t("settings.soundsSubtitle")}>
            <SettingRow icon={HiOutlineBellAlert} title={i18n.t("settings.allFeedbackTitle")} description={i18n.t("settings.allFeedbackDesc")}>
              <Toggle active={feedbackFx.sounds} label={feedbackFx.sounds ? i18n.t("settings.soundsOn") : i18n.t("settings.soundsOff")} onChange={(value) => updateSection("feedbackFx", { sounds: value })} />
              {/* iPhone browsers and the iOS app have no vibration API, so the switch would do nothing. */}
              {vibrationSupported ? (
                <Toggle active={feedbackFx.vibration} label={feedbackFx.vibration ? i18n.t("settings.vibrationOn") : i18n.t("settings.vibrationOff")} onChange={(value) => updateSection("feedbackFx", { vibration: value })} />
              ) : null}
              <button
                type="button"
                onClick={testFeedback}
                className="flex h-11 min-w-24 items-center justify-center rounded-2xl bg-slate-950 px-4 text-sm font-black text-white"
              >
                {i18n.t("settings.tryIt")}
              </button>
            </SettingRow>
            <SettingRow icon={HiOutlineBellAlert} title={i18n.t("settings.bannersTitle")} description={i18n.t("settings.bannersDesc")}>
              <Toggle active={feedbackFx.banners} label={feedbackFx.banners ? i18n.t("settings.bannersOn") : i18n.t("settings.bannersOff")} onChange={(value) => updateSection("feedbackFx", { banners: value })} />
            </SettingRow>
            <SettingRow icon={HiOutlineSparkles} title={i18n.t("settings.perServiceTitle")} description={i18n.t("settings.perServiceDesc")}>
              <Toggle active={feedbackFx.explore} label="Explore" onChange={(value) => updateSection("feedbackFx", { explore: value })} />
              <Toggle active={feedbackFx.messages} label={i18n.t("settings.messages")} onChange={(value) => updateSection("feedbackFx", { messages: value })} />
              <Toggle active={feedbackFx.marketplace} label="UrMall" onChange={(value) => updateSection("feedbackFx", { marketplace: value })} />
              <Toggle active={feedbackFx.transport} label="UrRide" onChange={(value) => updateSection("feedbackFx", { transport: value })} />
            </SettingRow>
          </SettingsSection>

          <SettingsSection title={i18n.t("settings.videoTitle")} subtitle={i18n.t("settings.videoSubtitle")}>
            <SettingRow icon={HiOutlineFilm} title={i18n.t("settings.autoplayTitle")} description={i18n.t("settings.autoplayDesc")}>
              <Toggle active={video.autoplay} onChange={(value) => updateSection("video", { autoplay: value })} />
            </SettingRow>
            <SettingRow icon={HiOutlineFilm} title={i18n.t("settings.defaultSoundTitle")} description={i18n.t("settings.defaultSoundDesc")}>
              <Toggle
                active={!video.defaultMuted}
                label={video.defaultMuted ? i18n.t("settings.muted") : i18n.t("settings.soundOn")}
                onChange={(value) => updateSection("video", { defaultMuted: !value })}
              />
            </SettingRow>
            <SettingRow icon={HiOutlineCircleStack} title={i18n.t("settings.reduceDataTitle")} description={i18n.t("settings.reduceDataDesc")}>
              <Toggle active={video.reduceData} onChange={(value) => updateSection("video", { reduceData: value })} />
            </SettingRow>
          </SettingsSection>

          <SettingsSection title={i18n.t("settings.feedTitle")} subtitle={i18n.t("settings.feedSubtitle")}>
            <SettingRow icon={HiOutlineHome} title={i18nText("ui.literals.k70bd52d7f68d")} description={i18nText("ui.literals.ka485e1d255fc")}>
              <SelectControl
                value={defaultDashboard}
                onChange={(value) => {
                  setDefaultDashboard(value);
                  setDefaultMainPage(value === "auto" ? "" : value);
                }}
                options={[
                  { value: "auto", label: i18nText("ui.literals.kf5000d2670af") },
                  { value: "explore", label: "Explore" },
                  { value: "marketplace", label: "UrMall" },
                  { value: "transport", label: "UrRide" },
                ]}
              />
            </SettingRow>
            <SettingRow icon={HiOutlineRectangleStack} title={i18n.t("settings.defaultTabTitle")} description={i18n.t("settings.defaultTabDesc")}>
              <SelectControl
                value={feed.defaultTab}
                onChange={(value) => updateSection("feed", { defaultTab: value })}
                options={[
                  { value: "UrFeed", label: "UrFeed" },
                  { value: "Swip", label: "Swip" },
                  { value: "Connections", label: i18n.t("nav.connections") },
                ]}
              />
            </SettingRow>
            <SettingRow icon={HiOutlineLanguage} title={i18n.t("settings.contentLanguageTitle")} description={i18n.t("settings.contentLanguageDesc")}>
              <SelectControl
                value={feed.language}
                onChange={(value) => updateSection("feed", { language: value })}
                options={[
                  { value: "auto", label: i18n.t("settings.langAuto") },
                  { value: "english", label: i18n.t("settings.langEnglish") },
                  { value: "krio", label: i18n.t("settings.langKrio") },
                  { value: "french", label: i18n.t("settings.langFrench") },
                ]}
              />
            </SettingRow>
            <SettingRow icon={HiOutlineSignal} title={i18n.t("settings.discoveryTitle")} description={i18n.t("settings.discoveryDesc")}>
              <Toggle active={feed.showSuggestedAccounts} label={i18n.t("settings.suggestions")} onChange={(value) => updateSection("feed", { showSuggestedAccounts: value })} />
              <Toggle active={feed.showSensitiveWarnings} label={i18n.t("settings.warnings")} onChange={(value) => updateSection("feed", { showSensitiveWarnings: value })} />
            </SettingRow>
          </SettingsSection>

          <SettingsSection title={i18n.t("settings.messagesSectionTitle")} subtitle={i18n.t("settings.messagesSectionSubtitle")}>
            <SettingRow icon={HiOutlineChatBubbleLeftRight} title={i18n.t("settings.presenceTitle")} description={i18n.t("settings.presenceDesc")}>
              <Toggle active={messages.showActiveStatus} label={i18n.t("settings.active")} onChange={(value) => updateSection("messages", { showActiveStatus: value })} />
              <Toggle active={messages.showTypingStatus} label={i18n.t("settings.typing")} onChange={(value) => updateSection("messages", { showTypingStatus: value })} />
            </SettingRow>
            <SettingRow icon={HiOutlineChatBubbleLeftRight} title={i18n.t("settings.conversationToolsTitle")} description={i18n.t("settings.conversationToolsDesc")}>
              <Toggle active={messages.allowVoiceNotes} label={i18n.t("settings.voice")} onChange={(value) => updateSection("messages", { allowVoiceNotes: value })} />
              <Toggle active={messages.readReceipts} label={i18n.t("settings.receipts")} onChange={(value) => updateSection("messages", { readReceipts: value })} />
            </SettingRow>
          </SettingsSection>
        </div>

        <SettingsSection title={i18n.t("settings.securityTitle")} subtitle={i18n.t("settings.securitySubtitle")}>
          <TwoFactorSection />
        </SettingsSection>

        <SettingsSection title={i18n.t("settings.accountTitle")} subtitle={i18n.t("settings.accountSubtitle")}>
          <div className="grid gap-3 lg:grid-cols-3">
            <button type="button" onClick={onSwitchAccount} className="rounded-[22px] border border-slate-200 bg-white p-5 text-left shadow-sm">
              <HiOutlineCog6Tooth className="text-2xl text-sky-700" />
              <p className="mt-3 text-base font-black text-slate-950">{i18n.t("settings.switchAccountTitle")}</p>
              <p className="mt-1 text-sm font-semibold leading-6 text-slate-500">{i18n.t("settings.switchAccountDesc")}</p>
            </button>
            <button type="button" onClick={clearCache} className="rounded-[22px] border border-slate-200 bg-white p-5 text-left shadow-sm">
              <HiOutlineCircleStack className="text-2xl text-sky-700" />
              <p className="mt-3 text-base font-black text-slate-950">{i18n.t("settings.clearCacheTitle")}</p>
              <p className="mt-1 text-sm font-semibold leading-6 text-slate-500">{i18n.t("settings.clearCacheDesc")}</p>
            </button>
            <div className="rounded-[22px] border border-rose-100 bg-rose-50 p-5 shadow-sm">
              <HiOutlineCog6Tooth className="text-2xl text-rose-700" />
              <p className="mt-3 text-base font-black text-rose-950">{i18n.t("settings.signOutTitle")}</p>
              <p className="mt-1 text-sm font-semibold leading-6 text-rose-700">
                {i18n.t("settings.signOutDesc")}
              </p>
              <button
                type="button"
                onClick={() => handleSignOut(false)}
                disabled={Boolean(signOutBusy)}
                className="mt-4 h-11 w-full rounded-2xl bg-rose-600 px-4 text-sm font-black text-white transition hover:bg-rose-700 disabled:opacity-60"
              >
                {signOutBusy === "this" ? i18n.t("exploreSettingsFix.signingOut") : i18n.t("settings.signOutBtn")}
              </button>
              {confirmSignOutAll ? (
                <div className="mt-2 rounded-2xl border border-rose-200 bg-white p-3">
                  <p className="text-xs font-bold leading-5 text-rose-800">{i18n.t("exploreSettingsFix.signOutAllConfirm")}</p>
                  <div className="mt-2 flex gap-2">
                    <button type="button" onClick={() => setConfirmSignOutAll(false)} disabled={Boolean(signOutBusy)} className="h-10 flex-1 rounded-xl bg-slate-100 text-xs font-black text-slate-700 disabled:opacity-60">
                      {i18n.t("common.cancel")}
                    </button>
                    <button type="button" onClick={() => handleSignOut(true)} disabled={Boolean(signOutBusy)} className="h-10 flex-1 rounded-xl bg-rose-600 text-xs font-black text-white disabled:opacity-60">
                      {signOutBusy === "all" ? i18n.t("exploreSettingsFix.signingOut") : i18n.t("settings.signOutAll")}
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmSignOutAll(true)}
                  disabled={Boolean(signOutBusy)}
                  className="mt-2 h-11 w-full rounded-2xl border border-rose-200 bg-white px-4 text-sm font-black text-rose-700 transition hover:bg-rose-100 disabled:opacity-60"
                >
                  {i18n.t("settings.signOutAll")}
                </button>
              )}
            </div>
          </div>
        </SettingsSection>
      </div>
    </div>
  );
}

function SettingsShortcut({ description, icon: Icon, onClick, title }) {
  useUiLocale();
  return (
    <button type="button" onClick={onClick} className="rounded-[22px] border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:border-sky-200 hover:bg-sky-50">
      <span className="grid h-11 w-11 place-items-center rounded-2xl bg-sky-50 text-sky-700"><Icon className="text-xl" /></span>
      <p className="mt-3 text-sm font-black text-slate-950">{translateUi(title)}</p>
      <p className="mt-1 text-xs font-semibold leading-5 text-slate-500">{translateUi(description)}</p>
    </button>
  );
}
