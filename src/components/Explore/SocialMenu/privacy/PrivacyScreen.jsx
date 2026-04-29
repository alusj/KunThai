import { HiOutlineEye, HiOutlineShieldCheck, HiOutlineUserMinus } from "react-icons/hi2";

import { useTrustSafety } from "../../../../Backend/hooks/useTrustSafety";
import EmptyState from "../../shared/EmptyState";
import SocialScreenHeader from "../shared/SocialScreenHeader";

function SettingRow({ children, description, icon: Icon, title }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-[22px] border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex min-w-0 items-start gap-3">
        <span className="flex h-10 w-10 flex-none items-center justify-center rounded-2xl bg-sky-50 text-sky-700">
          <Icon className="text-lg" />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-black text-slate-950">{title}</p>
          <p className="mt-1 text-sm leading-6 text-slate-500">{description}</p>
        </div>
      </div>
      <div className="flex-none">{children}</div>
    </div>
  );
}

export default function PrivacyScreen({ hideHeader = false }) {
  const safety = useTrustSafety();
  const settings = safety.privacySettings;
  const blockedUsers = Array.from(safety.blockedUsers);

  return (
    <div>
      {!hideHeader ? <SocialScreenHeader title="Privacy & Safety" subtitle="Control visibility, messages, blocks, and content filters." /> : null}

      <div className="w-full space-y-4 px-4 py-4 sm:px-5">
        <div className="rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-sky-700">Trust & Safety</p>
          <h3 className="mt-1 text-xl font-black text-slate-950">Your controls</h3>
          <p className="mt-2 text-sm leading-6 text-slate-600">Reports, blocks, privacy, and moderation filters help keep Explore cleaner.</p>
          {safety.feedback ? <p className="mt-3 text-xs font-bold text-sky-700">{safety.feedback}</p> : null}
        </div>

        <SettingRow icon={HiOutlineEye} title="Default post privacy" description="Choose the audience selected by default when creating new posts.">
          <select
            value={settings.defaultPostPrivacy}
            onChange={(event) => safety.updatePrivacySettings({ defaultPostPrivacy: event.target.value })}
            className="rounded-2xl bg-slate-100 px-3 py-2 text-sm font-bold text-slate-700 outline-none"
          >
            <option value="public">Public</option>
            <option value="circle">Circle</option>
            <option value="private">Private</option>
          </select>
        </SettingRow>

        <SettingRow icon={HiOutlineShieldCheck} title="Message privacy" description="Control who should be allowed to start conversations with you.">
          <select
            value={settings.allowMessages}
            onChange={(event) => safety.updatePrivacySettings({ allowMessages: event.target.value })}
            className="rounded-2xl bg-slate-100 px-3 py-2 text-sm font-bold text-slate-700 outline-none"
          >
            <option value="everyone">Everyone</option>
            <option value="followers">Followers</option>
            <option value="none">No one</option>
          </select>
        </SettingRow>

        <SettingRow icon={HiOutlineShieldCheck} title="Sensitive content filter" description="Hide posts that may contain flagged or abusive language.">
          <button
            type="button"
            onClick={() => safety.updatePrivacySettings({ filterSensitiveContent: !settings.filterSensitiveContent })}
            className={`h-9 rounded-2xl px-4 text-sm font-black ${settings.filterSensitiveContent ? "bg-sky-700 text-white" : "bg-slate-100 text-slate-600"}`}
          >
            {settings.filterSensitiveContent ? "On" : "Off"}
          </button>
        </SettingRow>

        <SettingRow icon={HiOutlineShieldCheck} title="Mentions" description="Allow people to mention you in comments and posts.">
          <button
            type="button"
            onClick={() => safety.updatePrivacySettings({ allowMentions: !settings.allowMentions })}
            className={`h-9 rounded-2xl px-4 text-sm font-black ${settings.allowMentions ? "bg-sky-700 text-white" : "bg-slate-100 text-slate-600"}`}
          >
            {settings.allowMentions ? "Allowed" : "Off"}
          </button>
        </SettingRow>

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
      </div>
    </div>
  );
}
