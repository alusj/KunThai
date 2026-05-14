import { createElement } from "react";
import {
  HiOutlineBellAlert,
  HiOutlineChatBubbleLeftRight,
  HiOutlineCircleStack,
  HiOutlineCog6Tooth,
  HiOutlineFilm,
  HiOutlineLanguage,
  HiOutlineRectangleStack,
  HiOutlineSignal,
} from "react-icons/hi2";

import { useExplorePreferences } from "../../../../Backend/hooks/useExplorePreferences";
import { signOutSocialSession, switchSocialAccount } from "../../../../Backend/services/sessionService";
import SocialScreenHeader from "../shared/SocialScreenHeader";

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

export default function SettingsScreen({ hideHeader = false }) {
  const { clearCache, feedback, settings, updateSection } = useExplorePreferences();
  const { notifications, video, feed, messages, account } = settings;

  return (
    <div>
      {!hideHeader ? (
        <SocialScreenHeader title="Settings" subtitle="Tune notifications, videos, feed behavior, messages, and account actions." />
      ) : null}

      <div className="w-full space-y-6 px-4 py-4 sm:px-6 lg:px-8">
        <div className="rounded-[26px] border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-black uppercase tracking-[0.2em] text-sky-700">Explore Settings</p>
          <h3 className="mt-1 text-2xl font-black text-slate-950">Make Explore behave your way</h3>
          <p className="mt-2 max-w-3xl text-base font-semibold leading-7 text-slate-600">
            These preferences save instantly on this device and sync to your account when the backend table is available.
          </p>
          {feedback ? <p className="mt-3 text-sm font-black text-sky-700">{feedback}</p> : null}
        </div>

        <div className="grid gap-6 xl:grid-cols-2">
          <SettingsSection title="Notifications" subtitle="Choose which actions should light up your bell and alert surfaces.">
            <SettingRow icon={HiOutlineBellAlert} title="Reactions and comments" description="Get updates when people like, save, or comment on your posts.">
              <Toggle active={notifications.reactions} label="Likes" onChange={(value) => updateSection("notifications", { reactions: value })} />
              <Toggle active={notifications.comments} label="Comments" onChange={(value) => updateSection("notifications", { comments: value })} />
            </SettingRow>
            <SettingRow icon={HiOutlineSignal} title="Social and followed posts" description="Follow alerts and posts from people you follow.">
              <Toggle active={notifications.follows} label="Follows" onChange={(value) => updateSection("notifications", { follows: value })} />
              <Toggle active={notifications.followedPosts} label="Posts" onChange={(value) => updateSection("notifications", { followedPosts: value })} />
            </SettingRow>
            <SettingRow icon={HiOutlineChatBubbleLeftRight} title="Messages and safety alerts" description="Message badges, safety notices, reports, and account alerts.">
              <Toggle active={notifications.messages} label="Messages" onChange={(value) => updateSection("notifications", { messages: value })} />
              <Toggle active={notifications.safetyAlerts} label="Safety" onChange={(value) => updateSection("notifications", { safetyAlerts: value })} />
            </SettingRow>
          </SettingsSection>

          <SettingsSection title="Swip Videos" subtitle="Control sound, autoplay, and data-friendly playback.">
            <SettingRow icon={HiOutlineFilm} title="Autoplay videos" description="Let videos start automatically when they become active on screen.">
              <Toggle active={video.autoplay} onChange={(value) => updateSection("video", { autoplay: value })} />
            </SettingRow>
            <SettingRow icon={HiOutlineFilm} title="Default sound" description="Choose whether Swip starts muted when Explore opens.">
              <Toggle
                active={!video.defaultMuted}
                label={video.defaultMuted ? "Muted" : "Sound on"}
                onChange={(value) => updateSection("video", { defaultMuted: !value })}
              />
            </SettingRow>
            <SettingRow icon={HiOutlineCircleStack} title="Use less data" description="Prefer lighter media behavior when network quality is poor.">
              <Toggle active={video.reduceData} onChange={(value) => updateSection("video", { reduceData: value })} />
            </SettingRow>
          </SettingsSection>

          <SettingsSection title="Feed" subtitle="Set the first tab, language, and discovery behavior.">
            <SettingRow icon={HiOutlineRectangleStack} title="Default Explore tab" description="Choose where Explore should open first later.">
              <SelectControl
                value={feed.defaultTab}
                onChange={(value) => updateSection("feed", { defaultTab: value })}
                options={[
                  { value: "UrFeed", label: "UrFeed" },
                  { value: "Swip", label: "Swip" },
                  { value: "Connections", label: "Connections" },
                ]}
              />
            </SettingRow>
            <SettingRow icon={HiOutlineLanguage} title="Content language" description="Use automatic language detection or prefer a specific language.">
              <SelectControl
                value={feed.language}
                onChange={(value) => updateSection("feed", { language: value })}
                options={[
                  { value: "auto", label: "Auto" },
                  { value: "english", label: "English" },
                  { value: "krio", label: "Krio" },
                  { value: "french", label: "French" },
                ]}
              />
            </SettingRow>
            <SettingRow icon={HiOutlineSignal} title="Discovery suggestions" description="Show suggested accounts and safety warnings in the feed.">
              <Toggle active={feed.showSuggestedAccounts} label="Suggestions" onChange={(value) => updateSection("feed", { showSuggestedAccounts: value })} />
              <Toggle active={feed.showSensitiveWarnings} label="Warnings" onChange={(value) => updateSection("feed", { showSensitiveWarnings: value })} />
            </SettingRow>
          </SettingsSection>

          <SettingsSection title="Messages" subtitle="Presence, typing, voice note, and read receipt preferences.">
            <SettingRow icon={HiOutlineChatBubbleLeftRight} title="Presence signals" description="Show when you are active and when you are typing.">
              <Toggle active={messages.showActiveStatus} label="Active" onChange={(value) => updateSection("messages", { showActiveStatus: value })} />
              <Toggle active={messages.showTypingStatus} label="Typing" onChange={(value) => updateSection("messages", { showTypingStatus: value })} />
            </SettingRow>
            <SettingRow icon={HiOutlineChatBubbleLeftRight} title="Conversation tools" description="Voice notes and read receipts for richer conversations.">
              <Toggle active={messages.allowVoiceNotes} label="Voice" onChange={(value) => updateSection("messages", { allowVoiceNotes: value })} />
              <Toggle active={messages.readReceipts} label="Receipts" onChange={(value) => updateSection("messages", { readReceipts: value })} />
            </SettingRow>
          </SettingsSection>
        </div>

        <SettingsSection title="Account" subtitle="Session and local device actions.">
          <div className="grid gap-3 lg:grid-cols-3">
            <button type="button" onClick={switchSocialAccount} className="rounded-[22px] border border-slate-200 bg-white p-5 text-left shadow-sm">
              <HiOutlineCog6Tooth className="text-2xl text-sky-700" />
              <p className="mt-3 text-base font-black text-slate-950">Switch account</p>
              <p className="mt-1 text-sm font-semibold leading-6 text-slate-500">Change the active Explore session.</p>
            </button>
            <button type="button" onClick={clearCache} className="rounded-[22px] border border-slate-200 bg-white p-5 text-left shadow-sm">
              <HiOutlineCircleStack className="text-2xl text-sky-700" />
              <p className="mt-3 text-base font-black text-slate-950">Clear local cache</p>
              <p className="mt-1 text-sm font-semibold leading-6 text-slate-500">Clear drafts, recent searches, and temporary state.</p>
            </button>
            <button type="button" onClick={signOutSocialSession} className="rounded-[22px] border border-rose-100 bg-rose-50 p-5 text-left shadow-sm">
              <HiOutlineCog6Tooth className="text-2xl text-rose-700" />
              <p className="mt-3 text-base font-black text-rose-950">Sign out</p>
              <p className="mt-1 text-sm font-semibold leading-6 text-rose-700">End this Explore account session.</p>
            </button>
          </div>
          <SettingRow icon={HiOutlineRectangleStack} title="Compact menu" description="Use a denser menu layout on small screens later.">
            <Toggle active={account.compactMenu} onChange={(value) => updateSection("account", { compactMenu: value })} />
          </SettingRow>
        </SettingsSection>
      </div>
    </div>
  );
}
