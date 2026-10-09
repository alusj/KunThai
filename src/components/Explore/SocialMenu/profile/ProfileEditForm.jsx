import { FaFacebookF, FaInstagram, FaTiktok, FaTwitter, FaWhatsapp, FaYoutube } from "react-icons/fa";

import { detectSocialPlatform, normalizeSocialLinks } from "../../../../Backend/services/explore/socialLinks";
import { useI18n } from "../../../../i18n";

const platformIcons = {
  facebook: FaFacebookF,
  instagram: FaInstagram,
  tiktok: FaTiktok,
  x: FaTwitter,
  whatsapp: FaWhatsapp,
  youtube: FaYoutube,
};

function SocialLinkInput({ index, onChange, value }) {
  const { t } = useI18n();
  const platform = detectSocialPlatform(value?.url);
  const Icon = platformIcons[platform?.id];

  return (
    <label className="block">
      <span className="mb-2 block text-xs font-black uppercase tracking-[0.18em] text-slate-500">{t("profile.socialLink", { index: index + 1 })}</span>
      <div className="flex items-center gap-2 rounded-xl bg-slate-50 px-3 focus-within:ring-2 focus-within:ring-sky-500/20">
        <span className={`flex h-9 w-9 items-center justify-center rounded-xl ${platform ? "bg-sky-50 text-sky-700" : "bg-white text-slate-400"}`}>
          {Icon ? <Icon /> : index + 1}
        </span>
        <input
          value={value?.url || ""}
          onChange={(event) => onChange(index, event.target.value)}
          className="h-11 min-w-0 flex-1 bg-transparent text-sm text-slate-700 outline-none"
          placeholder={t("profile.linkPlaceholder")}
        />
      </div>
    </label>
  );
}

function FormField({ children, className = "", hint = "", label }) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1 block text-xs font-black text-slate-500">{label}</span>
      {children}
      {hint ? <span className="mt-1 block text-[11px] font-semibold text-slate-400">{hint}</span> : null}
    </label>
  );
}

export default function ProfileEditForm({ onChange, values }) {
  const { t } = useI18n();
  const socialLinks = normalizeSocialLinks(values.socialLinks);

  function updateSocialLink(index, url) {
    const nextLinks = normalizeSocialLinks(socialLinks);
    nextLinks[index] = { ...nextLinks[index], url };
    onChange("socialLinks", normalizeSocialLinks(nextLinks));
  }

  const isSpace = Boolean(values.spaceId || values.identityType === "space" || values.isSpace);
  const fieldClass = "w-full rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-700 outline-none focus:ring-2 focus:ring-sky-500/20";

  return (
    <section className="grid gap-3 rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm sm:grid-cols-2">
      <FormField label={isSpace ? t("exploreProfileFix.spaceNameLabel") : t("exploreProfileFix.displayNameLabel")}>
        <input
          value={values.displayName || ""}
          onChange={(event) => onChange("displayName", event.target.value)}
          className={`${fieldClass} text-base font-semibold text-slate-950`}
          placeholder={t("profile.displayName")}
          maxLength={60}
          required
        />
      </FormField>
      <FormField
        label={isSpace ? t("exploreProfileFix.spaceHandleLabel") : t("exploreProfileFix.usernameLabel")}
        hint={isSpace ? t("exploreProfileFix.spaceHandleHint") : t("exploreProfileFix.usernameHint")}
      >
        <input
          value={values.username || ""}
          onChange={(event) => onChange("username", isSpace ? event.target.value.toLowerCase() : event.target.value)}
          className={fieldClass}
          placeholder={t("profile.username")}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          maxLength={isSpace ? 48 : 30}
        />
      </FormField>
      <FormField label={t("exploreProfileFix.bioLabel")} className="sm:col-span-2">
        <textarea
          value={values.bio || ""}
          onChange={(event) => onChange("bio", event.target.value)}
          className={`${fieldClass} min-h-24`}
          placeholder={t("profile.bio")}
        />
      </FormField>
      <FormField label={t("exploreProfileFix.emailPublicLabel")}>
        <input
          type="email"
          value={values.email || ""}
          onChange={(event) => onChange("email", event.target.value)}
          className={fieldClass}
          placeholder={t("profile.email")}
        />
      </FormField>
      <FormField label={t("exploreProfileFix.addressPublicLabel")}>
        <input
          value={values.address || ""}
          onChange={(event) => onChange("address", event.target.value)}
          className={fieldClass}
          placeholder={t("profile.address")}
        />
      </FormField>
      <FormField label={isSpace ? t("exploreProfileFix.phonePublicLabel") : t("exploreProfileFix.phonePrivateLabel")} className="sm:col-span-2">
        <input
          type="tel"
          value={values.phone || ""}
          onChange={(event) => onChange("phone", event.target.value)}
          className={fieldClass}
          placeholder={t("profile.phone")}
        />
      </FormField>
      <div className="grid gap-3 sm:col-span-2 lg:grid-cols-3">
        {socialLinks.map((link, index) => (
          <SocialLinkInput key={link.id} index={index} value={link} onChange={updateSocialLink} />
        ))}
      </div>
    </section>
  );
}
