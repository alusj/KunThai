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
  HiOutlineRectangleStack,
  HiOutlineSignal,
  HiOutlineShieldCheck,
  HiOutlineSparkles,
} from "react-icons/hi2";

import { useExplorePreferences } from "../../../../Backend/hooks/useExplorePreferences";
import { haptics, sounds } from "../../../../Backend/services/feedbackService";
import { disablePushNotifications, enablePushNotifications, getPushStatus } from "../../../../Backend/services/pushService";
import { showToast } from "../../../../Backend/services/toastService";
import { signOutSocialSession } from "../../../../Backend/services/sessionService";
import { useAppearanceMode } from "../../../../contexts/appearanceContext";
import { useI18n } from "../../../../i18n";
import SocialScreenHeader from "../shared/SocialScreenHeader";
import TwoFactorSection from "./TwoFactorSection";

function Toggle({ active, label, onChange }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!active)}
      className={`flex h-11 min-w-24 items-center justify-center rounded-2xl px-4 text-sm font-black transition ${
        active ? "bg-sky-700 text-white" : "bg-slate-100 text-slate-600"
      }`}
    >
      {label || (active ? "On" : "Off")}
    </button>
  );
}

function SelectControl({ value, onChange, options }) {
  return (
    <select
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className="h-11 rounded-2xl bg-slate-100 px-4 text-sm font-black text-slate-700 outline-none"
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

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
      <div className="flex flex-none flex-wrap gap-2 sm:justify-end">{children}</div>
    </div>
  );
}

function SettingsSection({ children, subtitle, title }) {
  return (
    <section className="space-y-3">
      <div>
        <p className="text-xs font-black uppercase tracking-[0.2em] text-sky-700">{title}</p>
        {subtitle ? <p className="mt-1 text-sm font-semibold text-slate-500">{subtitle}</p> : null}
      </div>
      <div className="grid gap-3">{children}</div>
    </section>
  );
}

export default function SettingsScreen({ hideHeader = false, onOpenDataMobile, onOpenInterests, onOpenPermissions, onOpenPrivacy, onOpenSecurity, onSwitchAccount }) {
  const { clearCache, feedback, settings, updateSection } = useExplorePreferences();
  const { mode: appearanceMode, resolvedMode, setMode: setAppearanceMode } = useAppearanceMode();
  const i18n = useI18n();
  const { notifications, video, feed, messages, account, feedbackFx } = settings;
  const [pushStatus, setPushStatus] = useState("loading");
  const [pushBusy, setPushBusy] = useState(false);

  async function handleSignOut(allDevices) {
    try {
      await signOutSocialSession({ allDevices });
      if (allDevices) {
        showToast(i18n.t("settings.toastSignedOutAll"), "success");
      }
    } catch (error) {
      showToast(error.message || i18n.t("settings.toastSignOutError"), "danger");
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
    if (pushBusy || pushStatus === "unsupported" || pushStatus === "loading") return;
    setPushBusy(true);
    try {
      const next = pushStatus === "enabled" ? await disablePushNotifications() : await enablePushNotifications();
      setPushStatus(next);
      showToast(next === "enabled" ? i18n.t("settings.toastPushOn") : i18n.t("settings.toastPushOff"), "success");
    } catch (error) {
      showToast(error.message || i18n.t("settings.toastPushError"), "danger");
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
          {feedback ? <p className="mt-3 text-sm font-black text-sky-700">{feedback}</p> : null}
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
                    ? i18n.t("settings.pushDenied")
                    : i18n.t("settings.pushDefault")
              }
            >
              <Toggle
                active={pushStatus === "enabled"}
                label={pushBusy || pushStatus === "loading" ? "..." : pushStatus === "enabled" ? i18n.t("settings.on") : i18n.t("settings.off")}
                onChange={togglePushNotifications}
              />
            </SettingRow>
            <SettingRow icon={HiOutlineBellAlert} title={i18n.t("settings.reactionsTitle")} description={i18n.t("settings.reactionsDesc")}>
              <Toggle active={notifications.reactions} label={i18n.t("settings.likes")} onChange={(value) => updateSection("notifications", { reactions: value })} />
              <Toggle active={notifications.comments} label={i18n.t("settings.comments")} onChange={(value) => updateSection("notifications", { comments: value })} />
            </SettingRow>
            <SettingRow icon={HiOutlineSignal} title={i18n.t("settings.socialPostsTitle")} description={i18n.t("settings.socialPostsDesc")}>
              <Toggle active={notifications.follows} label={i18n.t("settings.connects")} onChange={(value) => updateSection("notifications", { follows: value })} />
              <Toggle active={notifications.followedPosts} label={i18n.t("settings.posts")} onChange={(value) => updateSection("notifications", { followedPosts: value })} />
            </SettingRow>
            <SettingRow icon={HiOutlineChatBubbleLeftRight} title={i18n.t("settings.messagesSafetyTitle")} description={i18n.t("settings.messagesSafetyDesc")}>
              <Toggle active={notifications.messages} label={i18n.t("settings.messages")} onChange={(value) => updateSection("notifications", { messages: value })} />
              <Toggle active={notifications.safetyAlerts} label={i18n.t("settings.safety")} onChange={(value) => updateSection("notifications", { safetyAlerts: value })} />
            </SettingRow>
          </SettingsSection>

          <SettingsSection title={i18n.t("settings.soundsTitle")} subtitle={i18n.t("settings.soundsSubtitle")}>
            <SettingRow icon={HiOutlineBellAlert} title={i18n.t("settings.allFeedbackTitle")} description={i18n.t("settings.allFeedbackDesc")}>
              <Toggle active={feedbackFx.sounds} label={feedbackFx.sounds ? i18n.t("settings.soundsOn") : i18n.t("settings.soundsOff")} onChange={(value) => updateSection("feedbackFx", { sounds: value })} />
              <Toggle active={feedbackFx.vibration} label={feedbackFx.vibration ? i18n.t("settings.vibrationOn") : i18n.t("settings.vibrationOff")} onChange={(value) => updateSection("feedbackFx", { vibration: value })} />
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
                className="mt-4 h-11 w-full rounded-2xl bg-rose-600 px-4 text-sm font-black text-white transition hover:bg-rose-700"
              >
                {i18n.t("settings.signOutBtn")}
              </button>
              <button
                type="button"
                onClick={() => handleSignOut(true)}
                className="mt-2 h-11 w-full rounded-2xl border border-rose-200 bg-white px-4 text-sm font-black text-rose-700 transition hover:bg-rose-100"
              >
                {i18n.t("settings.signOutAll")}
              </button>
            </div>
          </div>
          <SettingRow icon={HiOutlineRectangleStack} title={i18n.t("settings.compactMenuTitle")} description={i18n.t("settings.compactMenuDesc")}>
            <Toggle active={account.compactMenu} onChange={(value) => updateSection("account", { compactMenu: value })} />
          </SettingRow>
        </SettingsSection>
      </div>
    </div>
  );
}

function SettingsShortcut({ description, icon: Icon, onClick, title }) {
  return (
    <button type="button" onClick={onClick} className="rounded-[22px] border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:border-sky-200 hover:bg-sky-50">
      <span className="grid h-11 w-11 place-items-center rounded-2xl bg-sky-50 text-sky-700"><Icon className="text-xl" /></span>
      <p className="mt-3 text-sm font-black text-slate-950">{title}</p>
      <p className="mt-1 text-xs font-semibold leading-5 text-slate-500">{description}</p>
    </button>
  );
}
