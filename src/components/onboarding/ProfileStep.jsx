import { useState } from "react";
import { Camera, CheckCircle2, Mail, MapPin, Phone, Search, ShieldCheck } from "lucide-react";
import { FaFacebookF, FaInstagram, FaTiktok, FaTwitter, FaWhatsapp, FaYoutube } from "react-icons/fa";

import { PHONE_ALREADY_LINKED_CODE } from "../../Backend/services/accountIdentityService";
import { detectSocialPlatform, normalizeSocialLinks } from "../../Backend/services/explore/socialLinks";
import FindAccountModal from "../auth/FindAccountModal";
import {
  constrainCountryPhoneInput,
  getActiveCountryProfile,
  getCountryAddressPlaceholder,
  getCountryPhoneHint,
  storeCountryContext,
  validateCountryPhone,
  GLOBAL_COUNTRY_PROFILES,
} from "../../data/globalCountryProfiles";
import OnboardingFrame from "./OnboardingFrame";

const accountTypes = [
  {
    id: "personal",
    title: "Personal",
    body: "For discovery, shopping, transport bookings, and everyday activity.",
  },
  {
    id: "business",
    title: "Business",
    body: "For selling, managing a store, receiving orders, and building a brand.",
  },
  {
    id: "both",
    title: "Both",
    body: "Use one profile for personal activity and business tools when you need them.",
  },
];

function buildFullName(values) {
  return [values.firstName, values.middleName, values.lastName]
    .map((part) => part.trim())
    .filter(Boolean)
    .join(" ");
}

function readAvatarFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onerror = reject;
    reader.onload = () => {
      const image = new Image();

      image.onerror = reject;
      image.onload = () => {
        const size = 320;
        const canvas = document.createElement("canvas");
        const context = canvas.getContext("2d");
        const shortestSide = Math.min(image.width, image.height);
        const sourceX = (image.width - shortestSide) / 2;
        const sourceY = (image.height - shortestSide) / 2;

        canvas.width = size;
        canvas.height = size;
        context.drawImage(image, sourceX, sourceY, shortestSide, shortestSide, 0, 0, size, size);
        resolve(canvas.toDataURL("image/jpeg", 0.82));
      };
      image.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

const platformIcons = {
  facebook: FaFacebookF,
  instagram: FaInstagram,
  tiktok: FaTiktok,
  x: FaTwitter,
  whatsapp: FaWhatsapp,
  youtube: FaYoutube,
};

function SocialLinkInput({ index, onChange, value }) {
  const platform = detectSocialPlatform(value?.url);
  const Icon = platformIcons[platform?.id];

  return (
    <label className="block">
      <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.26em] text-slate-500">
        Social link {index + 1}
      </span>
      <div className="flex items-center gap-2 rounded-[20px] border border-slate-200 bg-slate-50 px-3 focus-within:border-sky-400">
        <span className={`flex h-9 w-9 items-center justify-center rounded-2xl ${platform ? "bg-sky-50 text-sky-700" : "bg-white text-slate-400"}`}>
          {Icon ? <Icon /> : index + 1}
        </span>
        <input
          value={value?.url || ""}
          onChange={(event) => onChange(index, event.target.value)}
          placeholder="Paste Facebook, TikTok, Instagram, X, WhatsApp, or YouTube link"
          className="h-12 min-w-0 flex-1 bg-transparent text-sm font-semibold text-slate-800 outline-none"
        />
      </div>
    </label>
  );
}

export default function ProfileStep({ values, saving = false, error, errorCode = "", onChange, onBack, onNext }) {
  const [findAccountOpen, setFindAccountOpen] = useState(false);
  const phoneConflict = errorCode === PHONE_ALREADY_LINKED_CODE;
  const fullName = buildFullName(values);
  const previewName = fullName || values.displayName || "Your name";
  const countryProfile = getActiveCountryProfile(values.country);
  const phoneValidation = validateCountryPhone(values.phone, countryProfile);
  const emailValue = values.email.trim();
  const emailValid = !emailValue || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailValue);
  const canContinue =
    values.firstName.trim().length >= 2 &&
    values.lastName.trim().length >= 2 &&
    values.username.trim().length >= 3 &&
    emailValid &&
    phoneValidation.valid &&
    Boolean(values.dateOfBirth);

  const updateName = (field, value) => {
    const nextValues = { ...values, [field]: value };
    onChange({
      [field]: value,
      displayName: buildFullName(nextValues),
    });
  };

  const updateSocialLink = (index, url) => {
    const nextLinks = normalizeSocialLinks(values.socialLinks);
    nextLinks[index] = { ...nextLinks[index], url };
    onChange("socialLinks", normalizeSocialLinks(nextLinks));
  };

  const handleAvatarChange = async (event) => {
    const file = event.target.files?.[0];

    if (!file) return;

    const avatarUrl = await readAvatarFile(file);
    onChange("avatarUrl", avatarUrl);
  };

  return (
    <OnboardingFrame
      step={2}
      total={4}
      title="Set up your identity"
      subtitle="Create a trusted profile for discovery, marketplace conversations, payments, and transport."
    >
      <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
          <div className="grid gap-5 lg:grid-cols-[180px_1fr]">
            <div>
              <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.26em] text-slate-500">Profile photo</span>
              <label className="group flex min-h-[180px] cursor-pointer flex-col items-center justify-center rounded-[24px] border border-dashed border-slate-300 bg-slate-50 p-4 text-center transition hover:border-sky-400 hover:bg-sky-50">
                {values.avatarUrl ? (
                  <img src={values.avatarUrl} alt="Profile preview" className="h-24 w-24 rounded-3xl object-cover shadow-sm" />
                ) : (
                  <span className="flex h-24 w-24 items-center justify-center rounded-3xl bg-white text-slate-500 shadow-sm">
                    <Camera size={26} />
                  </span>
                )}
                <span className="mt-3 text-sm font-semibold text-slate-900">Upload photo</span>
                <span className="mt-1 text-xs leading-5 text-slate-500">Square image, clear face or logo</span>
                <input type="file" accept="image/*" className="sr-only" onChange={handleAvatarChange} />
              </label>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block">
                <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.26em] text-slate-500">First name</span>
                <input
                  value={values.firstName}
                  onChange={(event) => updateName("firstName", event.target.value)}
                  placeholder="First name"
                  className="w-full rounded-[20px] border border-slate-200 bg-slate-50 px-4 py-3 outline-none focus:border-sky-400"
                />
              </label>

              <label className="block">
                <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.26em] text-slate-500">Middle name</span>
                <input
                  value={values.middleName}
                  onChange={(event) => updateName("middleName", event.target.value)}
                  placeholder="Middle name (optional)"
                  className="w-full rounded-[20px] border border-slate-200 bg-slate-50 px-4 py-3 outline-none focus:border-sky-400"
                />
              </label>

              <label className="block">
                <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.26em] text-slate-500">Last name</span>
                <input
                  value={values.lastName}
                  onChange={(event) => updateName("lastName", event.target.value)}
                  placeholder="Last name"
                  className="w-full rounded-[20px] border border-slate-200 bg-slate-50 px-4 py-3 outline-none focus:border-sky-400"
                />
              </label>

              <label className="block">
                <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.26em] text-slate-500">Date of birth</span>
                <input
                  type="date"
                  value={values.dateOfBirth}
                  onChange={(event) => onChange("dateOfBirth", event.target.value)}
                  className="w-full rounded-[20px] border border-slate-200 bg-slate-50 px-4 py-3 outline-none focus:border-sky-400"
                />
              </label>
            </div>
          </div>

          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.26em] text-slate-500">Email</span>
              <input
                type="email"
                value={values.email}
                onChange={(event) => onChange("email", event.target.value)}
                placeholder="name@example.com"
                aria-invalid={!emailValid}
                className="w-full rounded-[20px] border border-slate-200 bg-slate-50 px-4 py-3 outline-none focus:border-sky-400"
              />
              {!emailValid ? (
                <span className="mt-2 block text-xs font-semibold text-rose-600">
                  Enter a valid email address or leave this blank.
                </span>
              ) : null}
            </label>

            <label className="block">
              <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.26em] text-slate-500">Phone number</span>
              <input
                type="tel"
                value={values.phone}
                onChange={(event) => onChange("phone", constrainCountryPhoneInput(event.target.value, countryProfile))}
                placeholder={getCountryPhoneHint(countryProfile)}
                inputMode="tel"
                aria-invalid={phoneConflict || (!phoneValidation.valid && Boolean(values.phone))}
                className={`w-full rounded-[20px] border bg-slate-50 px-4 py-3 outline-none focus:border-sky-400 ${
                  phoneConflict ? "border-rose-300" : "border-slate-200"
                }`}
              />
              {phoneConflict ? (
                <span className="mt-2 block text-xs font-semibold text-rose-600" role="alert">
                  This number is already associated with another account.
                </span>
              ) : (
                <span className={`mt-2 block text-xs font-semibold ${phoneValidation.valid || !values.phone ? "text-slate-500" : "text-rose-600"}`}>
                  {phoneValidation.valid ? `${countryProfile.name}: ${countryProfile.dialCode} ${countryProfile.placeholder}` : phoneValidation.message}
                </span>
              )}
              {phoneConflict ? (
                <button
                  type="button"
                  onClick={(event) => {
                    event.preventDefault();
                    setFindAccountOpen(true);
                  }}
                  className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-sky-300 bg-sky-50 px-3 py-1.5 text-xs font-semibold text-sky-700 transition hover:bg-sky-100"
                >
                  <Search size={13} aria-hidden="true" />
                  Find my account
                </button>
              ) : null}
            </label>
          </div>

          <label className="mt-5 block">
            <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.26em] text-slate-500">Address</span>
            <input
              value={values.address || ""}
              onChange={(event) => onChange("address", event.target.value)}
              placeholder={getCountryAddressPlaceholder(countryProfile)}
              className="w-full rounded-[20px] border border-slate-200 bg-slate-50 px-4 py-3 outline-none focus:border-sky-400"
            />
          </label>

          <div className="mt-5 grid gap-4 sm:grid-cols-3">
            <label className="block sm:col-span-1">
              <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.26em] text-slate-500">Username</span>
              <input
                value={values.username}
                onChange={(event) => onChange("username", event.target.value.replace(/\s+/g, "").toLowerCase())}
                placeholder="@username"
                className="w-full rounded-[20px] border border-slate-200 bg-slate-50 px-4 py-3 outline-none focus:border-sky-400"
              />
            </label>

            <label className="block">
              <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.26em] text-slate-500">City</span>
              <input
                value={values.city}
                onChange={(event) => onChange("city", event.target.value)}
                placeholder={countryProfile.cityPlaceholder}
                className="w-full rounded-[20px] border border-slate-200 bg-slate-50 px-4 py-3 outline-none focus:border-sky-400"
              />
            </label>

            <label className="block">
              <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.26em] text-slate-500">Country</span>
              <select
                value={countryProfile.name}
                onChange={(event) => {
                  const selectedCountry = getActiveCountryProfile(event.target.value);
                  storeCountryContext(selectedCountry.iso2);
                  onChange({
                    country: selectedCountry.name,
                    countryCode: selectedCountry.iso2,
                    currency: selectedCountry.currency.code,
                  });
                }}
                className="w-full rounded-[20px] border border-slate-200 bg-slate-50 px-4 py-3 outline-none focus:border-sky-400"
              >
                {GLOBAL_COUNTRY_PROFILES.map((country) => (
                  <option key={country.iso2} value={country.name}>{country.name}</option>
                ))}
              </select>
            </label>
          </div>

          <div className="mt-5">
            <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.26em] text-slate-500">Social profiles</span>
            <div className="grid gap-4 lg:grid-cols-3">
              {normalizeSocialLinks(values.socialLinks).map((link, index) => (
                <SocialLinkInput key={link.id} index={index} value={link} onChange={updateSocialLink} />
              ))}
            </div>
          </div>

          <div className="mt-5">
            <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.26em] text-slate-500">Account type</span>
            <div className="grid gap-3 lg:grid-cols-3">
              {accountTypes.map((type) => (
                <button
                  key={type.id}
                  type="button"
                  onClick={() => onChange("accountType", type.id)}
                  className={`rounded-[22px] border px-4 py-4 text-left transition ${
                    values.accountType === type.id
                      ? "border-sky-500 bg-sky-50 shadow-sm"
                      : "border-slate-200 bg-white hover:border-slate-300"
                  }`}
                >
                  <p className="text-sm font-semibold text-slate-900">{type.title}</p>
                  <p className="mt-1 text-sm leading-6 text-slate-600">{type.body}</p>
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="rounded-[28px] border border-slate-200 bg-[linear-gradient(180deg,#082f49,#0f172a)] p-5 text-white shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.26em] text-sky-200">Profile preview</p>
          <div className="mt-4 rounded-[24px] bg-white/10 p-5">
            <div className="flex items-start justify-between gap-4">
              {values.avatarUrl ? (
                <img src={values.avatarUrl} alt="Profile preview" className="h-16 w-16 rounded-3xl object-cover" />
              ) : (
                <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-white/15 text-xl font-semibold">
                  {previewName.slice(0, 1).toUpperCase()}
                </div>
              )}
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-400/15 px-3 py-1 text-xs font-semibold text-emerald-100">
                <ShieldCheck size={14} />
                Trusted
              </span>
            </div>

            <p className="mt-5 text-xl font-semibold">{previewName}</p>
            <p className="mt-1 text-sm text-slate-300">{values.username ? `@${values.username}` : "@username"}</p>

            <div className="mt-5 space-y-3 text-sm text-slate-300">
              <p className="flex items-center gap-2">
                <Mail size={15} />
                {values.email || "email@example.com"}
              </p>
              <p className="flex items-center gap-2">
                <Phone size={15} />
                {values.phone || `${countryProfile.dialCode} phone number`}
              </p>
              <p className="flex items-center gap-2">
                <MapPin size={15} />
                {values.address || "Address"}
              </p>
              <p>
                {values.city || "City"}, {values.country || "Country"}
              </p>
            </div>

            <div className="mt-5 flex flex-wrap gap-2">
              <p className="inline-flex rounded-full bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-sky-100">
                {values.accountType}
              </p>
              {normalizeSocialLinks(values.socialLinks).filter((link) => link.url).map((link) => {
                const Icon = platformIcons[link.platform];
                return (
                  <p key={link.id} className="inline-flex items-center gap-1 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-sky-100">
                    {Icon ? <Icon /> : null}
                    {link.label || "Social"}
                  </p>
                );
              })}
              {values.dateOfBirth && (
                <p className="inline-flex items-center gap-1 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-sky-100">
                  <CheckCircle2 size={13} />
                  DOB added
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

      {error && !phoneConflict ? (
        <p className="mt-5 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700" role="alert">
          {error}
        </p>
      ) : null}

      {findAccountOpen ? (
        <FindAccountModal
          country={values.country}
          phone={values.phone}
          redirectTo={typeof window !== "undefined" ? window.location.origin : undefined}
          onClose={() => setFindAccountOpen(false)}
          onTryAnotherNumber={() => {
            setFindAccountOpen(false);
            onChange("phone", "");
          }}
        />
      ) : null}

      <div className="mt-6 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={onBack}
          className="rounded-[20px] border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
        >
          Back
        </button>
        <button
          type="button"
          disabled={!canContinue || saving}
          onClick={onNext}
          className="rounded-[20px] bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving ? "Saving..." : "Continue"}
        </button>
      </div>
    </OnboardingFrame>
  );
}
