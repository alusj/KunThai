import { FaFacebookF, FaInstagram, FaTiktok } from "react-icons/fa";

import { detectSocialPlatform, normalizeSocialLinks } from "../../../../Backend/services/explore/socialLinks";

const platformIcons = {
  facebook: FaFacebookF,
  instagram: FaInstagram,
  tiktok: FaTiktok,
};

function SocialLinkInput({ index, onChange, value }) {
  const platform = detectSocialPlatform(value?.url);
  const Icon = platformIcons[platform?.id];

  return (
    <label className="block">
      <span className="mb-2 block text-xs font-black uppercase tracking-[0.18em] text-slate-500">Social link {index + 1}</span>
      <div className="flex items-center gap-2 rounded-xl bg-slate-50 px-3 focus-within:ring-2 focus-within:ring-sky-500/20">
        <span className={`flex h-9 w-9 items-center justify-center rounded-xl ${platform ? "bg-sky-50 text-sky-700" : "bg-white text-slate-400"}`}>
          {Icon ? <Icon /> : index + 1}
        </span>
        <input
          value={value?.url || ""}
          onChange={(event) => onChange(index, event.target.value)}
          className="h-11 min-w-0 flex-1 bg-transparent text-sm text-slate-700 outline-none"
          placeholder="Paste Facebook, Instagram, or TikTok link"
        />
      </div>
    </label>
  );
}

export default function ProfileEditForm({ onChange, values }) {
  const socialLinks = normalizeSocialLinks(values.socialLinks);

  function updateSocialLink(index, url) {
    const nextLinks = normalizeSocialLinks(socialLinks);
    nextLinks[index] = { ...nextLinks[index], url };
    onChange("socialLinks", normalizeSocialLinks(nextLinks));
  }

  return (
    <section className="grid gap-2 rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm sm:grid-cols-2">
      <input
        value={values.displayName || ""}
        onChange={(event) => onChange("displayName", event.target.value)}
        className="rounded-xl bg-slate-50 px-3 py-2 text-base font-semibold text-slate-950 outline-none focus:ring-2 focus:ring-sky-500/20"
        placeholder="Display name"
      />
      <input
        value={values.username || ""}
        onChange={(event) => onChange("username", event.target.value)}
        className="rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-700 outline-none focus:ring-2 focus:ring-sky-500/20"
        placeholder="username"
      />
      <textarea
        value={values.bio || ""}
        onChange={(event) => onChange("bio", event.target.value)}
        className="min-h-24 rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-700 outline-none focus:ring-2 focus:ring-sky-500/20 sm:col-span-2"
        placeholder="Bio"
      />
      <input
        value={values.email || ""}
        onChange={(event) => onChange("email", event.target.value)}
        className="rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-700 outline-none focus:ring-2 focus:ring-sky-500/20"
        placeholder="Email"
      />
      <input
        value={values.phone || ""}
        onChange={(event) => onChange("phone", event.target.value)}
        className="rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-700 outline-none focus:ring-2 focus:ring-sky-500/20"
        placeholder="Phone"
      />
      <div className="grid gap-3 sm:col-span-2 lg:grid-cols-3">
        {socialLinks.map((link, index) => (
          <SocialLinkInput key={link.id} index={index} value={link} onChange={updateSocialLink} />
        ))}
      </div>
    </section>
  );
}
