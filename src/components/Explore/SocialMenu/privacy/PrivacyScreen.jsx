import { createElement } from "react";
import {
  HiOutlineArrowDownTray,
  HiOutlineBolt,
  HiOutlineChatBubbleLeftRight,
  HiOutlineCircleStack,
  HiOutlineEye,
  HiOutlineShieldCheck,
  HiOutlineTrash,
  HiOutlineUserMinus,
} from "react-icons/hi2";

import { useTrustSafety } from "../../../../Backend/hooks/useTrustSafety";
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
  const safety = useTrustSafety();
  const settings = safety.privacySettings;
  const blockedUsers = Array.from(safety.blockedUsers);

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
              <option value="followers">Followers</option>
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

          <SettingRow icon={HiOutlineBolt} title="Activity visibility" description="Show likes, follows, and recent social actions on your profile activity surfaces.">
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

        <PrivacySection title="Your data and account" description="Data export and deletion need verified backend workflows before they can be enabled safely.">
          <button type="button" disabled className="flex items-start gap-3 rounded-[24px] border border-slate-200 bg-white p-4 text-left opacity-75 shadow-sm">
            <span className="grid h-12 w-12 flex-none place-items-center rounded-2xl bg-sky-50 text-sky-700"><HiOutlineArrowDownTray className="text-2xl" /></span>
            <span><span className="block text-base font-black text-slate-950">Download my data</span><span className="mt-1 block text-sm font-semibold leading-6 text-slate-500">A verified export request flow is being prepared.</span><span className="mt-2 inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-black text-slate-600">Placeholder</span></span>
          </button>
          <button type="button" disabled className="flex items-start gap-3 rounded-[24px] border border-rose-100 bg-rose-50 p-4 text-left opacity-75">
            <span className="grid h-12 w-12 flex-none place-items-center rounded-2xl bg-white text-rose-700"><HiOutlineTrash className="text-2xl" /></span>
            <span><span className="block text-base font-black text-rose-950">Delete account</span><span className="mt-1 block text-sm font-semibold leading-6 text-rose-700">Account verification, retention notices, and a recovery window must be completed first.</span><span className="mt-2 inline-flex rounded-full bg-white px-2.5 py-1 text-[11px] font-black text-rose-700">Placeholder</span></span>
          </button>
        </PrivacySection>

        {/* Future backend: connect verified data-export jobs and multi-step account deletion with retention and recovery notices. */}
      </div>
    </div>
  );
}
