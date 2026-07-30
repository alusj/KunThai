import { useRef, useState } from "react";
import { Cake, Camera, CheckCircle2, Mail, MapPin, Phone, Search, ShieldCheck } from "lucide-react";
import { FaFacebookF, FaInstagram, FaTiktok, FaTwitter, FaWhatsapp, FaYoutube } from "react-icons/fa";

import { PHONE_ALREADY_LINKED_CODE } from "../../Backend/services/accountIdentityService";
import { detectSocialPlatform, normalizeSocialLinks } from "../../Backend/services/explore/socialLinks";
import FindAccountModal from "../auth/FindAccountModal";
import {
  constrainCountryPhoneInput,
  getActiveCountryProfile,
  getCountryPhoneHint,
  storeCountryContext,
  validateCountryPhone,
  GLOBAL_COUNTRY_PROFILES,
} from "../../data/globalCountryProfiles";
import PhoneCountryField from "../shared/PhoneCountryField";
import CenteredModal from "../shared/CenteredModal";
import OnboardingFrame from "./OnboardingFrame";
import { scrollToFirstBlockingFieldSoon } from "../shared/formValidationNavigation";
import { useI18n, t } from "../../i18n";

// KunThai's minimum age to hold an account.
const MINIMUM_AGE = 13;

function computeAgeYears(dateOfBirth) {
  if (!dateOfBirth) return null;
  const birth = new Date(dateOfBirth);
  if (Number.isNaN(birth.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  const monthDelta = now.getMonth() - birth.getMonth();
  if (monthDelta < 0 || (monthDelta === 0 && now.getDate() < birth.getDate())) {
    age -= 1;
  }
  return age;
}

const accountTypes = [
  { id: "personal", titleKey: "acctPersonal", bodyKey: "acctPersonalBody" },
  { id: "business", titleKey: "acctBusiness", bodyKey: "acctBusinessBody" },
  { id: "both", titleKey: "acctBoth", bodyKey: "acctBothBody" },
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
        {t("onboarding.profile.socialLinkN", { n: index + 1 })}
      </span>
      <div className="flex items-center gap-2 rounded-[20px] border border-slate-200 bg-slate-50 px-3 focus-within:border-sky-400">
        <span className={`flex h-9 w-9 items-center justify-center rounded-2xl ${platform ? "bg-sky-50 text-sky-700" : "bg-white text-slate-400"}`}>
          {Icon ? <Icon /> : index + 1}
        </span>
        <input
          value={value?.url || ""}
          onChange={(event) => onChange(index, event.target.value)}
          placeholder={t("onboarding.profile.socialPlaceholder")}
          className="h-12 min-w-0 flex-1 bg-transparent text-sm font-semibold text-slate-800 outline-none"
        />
      </div>
    </label>
  );
}

function clearFieldError(setFieldErrors, field) {
  setFieldErrors((current) => {
    if (!current[field]) return current;
    const next = { ...current };
    delete next[field];
    return next;
  });
}

function InlineFieldError({ message }) {
  if (!message) return null;
  return <span className="mt-2 block text-xs font-semibold text-rose-600" role="alert">{message}</span>;
}

export default function ProfileStep({ values, saving = false, error, errorCode = "", onChange, onBack, onNext }) {
  useI18n();
  const [findAccountOpen, setFindAccountOpen] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({});
  const [underageOpen, setUnderageOpen] = useState(false);
  const formRef = useRef(null);
  const ageYears = computeAgeYears(values.dateOfBirth);
  const isUnderage = ageYears !== null && ageYears < MINIMUM_AGE;
  const phoneConflict = errorCode === PHONE_ALREADY_LINKED_CODE;
  const fullName = buildFullName(values);
  const previewName = fullName || values.displayName || t("onboarding.profile.yourName");
  const countryProfile = getActiveCountryProfile(values.country);
  const phoneValidation = validateCountryPhone(values.phone, countryProfile);
  const emailValue = values.email.trim();
  const emailValid = !emailValue || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailValue);

  function validateProfileFields() {
    const nextErrors = {};
    if (values.firstName.trim().length < 2) nextErrors.firstName = t("onboarding.profile.errFirstName");
    if (values.lastName.trim().length < 2) nextErrors.lastName = t("onboarding.profile.errLastName");
    if (!values.dateOfBirth) nextErrors.dateOfBirth = t("onboarding.profile.errDob");
    else if (isUnderage) nextErrors.dateOfBirth = t("onboarding.profile.errUnderage", { age: MINIMUM_AGE });
    if (!values.phone.trim()) nextErrors.phone = t("onboarding.profile.errPhone");
    else if (!phoneValidation.valid) nextErrors.phone = phoneValidation.message;
    if (emailValue && !emailValid) nextErrors.email = t("onboarding.profile.errEmail");
    if (values.username.trim().length < 3) nextErrors.username = t("onboarding.profile.errUsername");
    return nextErrors;
  }

  function handleContinue() {
    const nextErrors = validateProfileFields();
    setFieldErrors(nextErrors);
    // Age is a hard eligibility gate: surface the caution card and stop here.
    if (isUnderage) {
      setUnderageOpen(true);
      scrollToFirstBlockingFieldSoon(formRef.current);
      return;
    }
    if (Object.keys(nextErrors).length) {
      scrollToFirstBlockingFieldSoon(formRef.current);
      return;
    }
    onNext?.();
  }

  const updateName = (field, value) => {
    clearFieldError(setFieldErrors, field);
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
      title={t("onboarding.profile.title")}
      subtitle={t("onboarding.profile.subtitle")}
    >
      <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <div ref={formRef} className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
          <div className="grid gap-5 lg:grid-cols-[180px_1fr]">
            <div>
              <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.26em] text-slate-500">{t("onboarding.profile.profilePhoto")}</span>
              <label className="group flex min-h-[180px] cursor-pointer flex-col items-center justify-center rounded-[24px] border border-dashed border-slate-300 bg-slate-50 p-4 text-center transition hover:border-sky-400 hover:bg-sky-50">
                {values.avatarUrl ? (
                  <img src={values.avatarUrl} alt={t("onboarding.profile.previewAlt")} className="h-24 w-24 rounded-3xl object-cover shadow-sm" />
                ) : (
                  <span className="flex h-24 w-24 items-center justify-center rounded-3xl bg-white text-slate-500 shadow-sm">
                    <Camera size={26} />
                  </span>
                )}
                <span className="mt-3 text-sm font-semibold text-slate-900">{t("onboarding.profile.uploadPhoto")}</span>
                <span className="mt-1 text-xs leading-5 text-slate-500">{t("onboarding.profile.photoHint")}</span>
                <input type="file" accept="image/*" className="sr-only" onChange={handleAvatarChange} />
              </label>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block" data-field-error={fieldErrors.firstName ? "true" : undefined}>
                <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.26em] text-slate-500">{t("onboarding.profile.firstName")}</span>
                <input
                  value={values.firstName}
                  onChange={(event) => updateName("firstName", event.target.value)}
                  placeholder={t("onboarding.profile.firstName")}
                  aria-invalid={fieldErrors.firstName ? "true" : undefined}
                  className={`w-full rounded-[20px] border bg-slate-50 px-4 py-3 outline-none focus:border-sky-400 ${fieldErrors.firstName ? "border-rose-300" : "border-slate-200"}`}
                />
                <InlineFieldError message={fieldErrors.firstName} />
              </label>

              <label className="block">
                <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.26em] text-slate-500">{t("onboarding.profile.middleName")}</span>
                <input
                  value={values.middleName}
                  onChange={(event) => updateName("middleName", event.target.value)}
                  placeholder={t("onboarding.profile.middlePlaceholder")}
                  className="w-full rounded-[20px] border border-slate-200 bg-slate-50 px-4 py-3 outline-none focus:border-sky-400"
                />
              </label>

              <label className="block" data-field-error={fieldErrors.lastName ? "true" : undefined}>
                <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.26em] text-slate-500">{t("onboarding.profile.lastName")}</span>
                <input
                  value={values.lastName}
                  onChange={(event) => updateName("lastName", event.target.value)}
                  placeholder={t("onboarding.profile.lastName")}
                  aria-invalid={fieldErrors.lastName ? "true" : undefined}
                  className={`w-full rounded-[20px] border bg-slate-50 px-4 py-3 outline-none focus:border-sky-400 ${fieldErrors.lastName ? "border-rose-300" : "border-slate-200"}`}
                />
                <InlineFieldError message={fieldErrors.lastName} />
              </label>

              <label className="block" data-field-error={fieldErrors.dateOfBirth ? "true" : undefined}>
                <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.26em] text-slate-500">{t("onboarding.profile.dob")}</span>
                <input
                  type="date"
                  value={values.dateOfBirth}
                  onChange={(event) => {
                    clearFieldError(setFieldErrors, "dateOfBirth");
                    onChange("dateOfBirth", event.target.value);
                  }}
                  aria-invalid={fieldErrors.dateOfBirth ? "true" : undefined}
                  className={`w-full rounded-[20px] border bg-slate-50 px-4 py-3 outline-none focus:border-sky-400 ${fieldErrors.dateOfBirth ? "border-rose-300" : "border-slate-200"}`}
                />
                <InlineFieldError message={fieldErrors.dateOfBirth} />
              </label>
            </div>
          </div>

          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <label className="block" data-field-error={fieldErrors.email ? "true" : undefined}>
              <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.26em] text-slate-500">{t("onboarding.profile.email")}</span>
              <input
                type="email"
                value={values.email}
                onChange={(event) => {
                  clearFieldError(setFieldErrors, "email");
                  onChange("email", event.target.value);
                }}
                placeholder={t("onboarding.profile.emailPlaceholder")}
                aria-invalid={fieldErrors.email || !emailValid ? "true" : undefined}
                className={`w-full rounded-[20px] border bg-slate-50 px-4 py-3 outline-none focus:border-sky-400 ${fieldErrors.email ? "border-rose-300" : "border-slate-200"}`}
              />
              {fieldErrors.email ? <InlineFieldError message={fieldErrors.email} /> : !emailValid ? (
                <span className="mt-2 block text-xs font-semibold text-rose-600">
                  {t("onboarding.profile.errEmail")}
                </span>
              ) : null}
            </label>

            <label className="block" data-field-error={fieldErrors.phone || phoneConflict ? "true" : undefined}>
              <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.26em] text-slate-500">{t("onboarding.profile.phone")}</span>
              <PhoneCountryField
                country={countryProfile}
                phone={values.phone}
                onCountryChange={(selected) => {
                  const selectedCountry = getActiveCountryProfile(selected.iso2);
                  clearFieldError(setFieldErrors, "phone");
                  // Match phone sign-in behavior: changing the dial country clears
                  // entered digits so a number is never submitted under the wrong code.
                  onChange({
                    country: selectedCountry.name,
                    countryCode: selectedCountry.iso2,
                    currency: selectedCountry.currency.code,
                    phone: "",
                  });
                }}
                onPhoneChange={(value) => {
                  clearFieldError(setFieldErrors, "phone");
                  onChange("phone", constrainCountryPhoneInput(value, countryProfile, { international: true }));
                }}
                placeholder={getCountryPhoneHint(countryProfile)}
                invalid={Boolean(phoneConflict || fieldErrors.phone || (!phoneValidation.valid && Boolean(values.phone)))}
              />
              {phoneConflict ? (
                <span className="mt-2 block text-xs font-semibold text-rose-600" role="alert">
                  {t("onboarding.profile.phoneConflict")}
                </span>
              ) : fieldErrors.phone ? (
                <InlineFieldError message={fieldErrors.phone} />
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
                  {t("onboarding.profile.findAccount")}
                </button>
              ) : null}
            </label>
          </div>

          <label className="mt-5 block">
            <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.26em] text-slate-500">{t("onboarding.profile.address")}</span>
            <input
              value={values.address || ""}
              onChange={(event) => onChange("address", event.target.value)}
              placeholder={t("onboarding.profile.address")}
              className="w-full rounded-[20px] border border-slate-200 bg-slate-50 px-4 py-3 outline-none focus:border-sky-400"
            />
          </label>

          <div className="mt-5 grid gap-4 sm:grid-cols-3">
            <label className="block sm:col-span-1" data-field-error={fieldErrors.username ? "true" : undefined}>
              <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.26em] text-slate-500">{t("onboarding.profile.username")}</span>
              <input
                value={values.username}
                onChange={(event) => {
                  clearFieldError(setFieldErrors, "username");
                  onChange("username", event.target.value.replace(/\s+/g, "").toLowerCase());
                }}
                placeholder={t("onboarding.profile.usernamePlaceholder")}
                aria-invalid={fieldErrors.username ? "true" : undefined}
                className={`w-full rounded-[20px] border bg-slate-50 px-4 py-3 outline-none focus:border-sky-400 ${fieldErrors.username ? "border-rose-300" : "border-slate-200"}`}
              />
              <InlineFieldError message={fieldErrors.username} />
            </label>

            <label className="block">
              <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.26em] text-slate-500">{t("onboarding.profile.city")}</span>
              <input
                value={values.city}
                onChange={(event) => onChange("city", event.target.value)}
                placeholder={t("onboarding.profile.city")}
                className="w-full rounded-[20px] border border-slate-200 bg-slate-50 px-4 py-3 outline-none focus:border-sky-400"
              />
            </label>

            <label className="block">
              <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.26em] text-slate-500">{t("onboarding.profile.country")}</span>
              <select
                value={countryProfile.name}
                onChange={(event) => {
                  const selectedCountry = getActiveCountryProfile(event.target.value);
                  storeCountryContext(selectedCountry.iso2);
                  onChange({
                    country: selectedCountry.name,
                    countryCode: selectedCountry.iso2,
                    currency: selectedCountry.currency.code,
                    // Re-prefix any digits already entered under the new dial code;
                    // per-country length validation re-checks them on submit.
                    phone: constrainCountryPhoneInput(values.phone, selectedCountry, { international: true }),
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
            <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.26em] text-slate-500">{t("onboarding.profile.socialProfiles")}</span>
            <div className="grid gap-4 lg:grid-cols-3">
              {normalizeSocialLinks(values.socialLinks).map((link, index) => (
                <SocialLinkInput key={link.id} index={index} value={link} onChange={updateSocialLink} />
              ))}
            </div>
          </div>

          <div className="mt-5">
            <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.26em] text-slate-500">{t("onboarding.profile.accountType")}</span>
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
                  <p className="text-sm font-semibold text-slate-900">{t(`onboarding.profile.${type.titleKey}`)}</p>
                  <p className="mt-1 text-sm leading-6 text-slate-600">{t(`onboarding.profile.${type.bodyKey}`)}</p>
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="rounded-[28px] border border-slate-200 bg-[linear-gradient(180deg,#082f49,#0f172a)] p-5 text-white shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.26em] text-sky-200">{t("onboarding.profile.profilePreview")}</p>
          <div className="mt-4 rounded-[24px] bg-white/10 p-5">
            <div className="flex items-start justify-between gap-4">
              {values.avatarUrl ? (
                <img src={values.avatarUrl} alt={t("onboarding.profile.previewAlt")} className="h-16 w-16 rounded-3xl object-cover" />
              ) : (
                <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-white/15 text-xl font-semibold">
                  {previewName.slice(0, 1).toUpperCase()}
                </div>
              )}
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-400/15 px-3 py-1 text-xs font-semibold text-emerald-100">
                <ShieldCheck size={14} />
                {t("onboarding.profile.trusted")}
              </span>
            </div>

            <p className="mt-5 text-xl font-semibold">{previewName}</p>
            <p className="mt-1 text-sm text-slate-300">{values.username ? `@${values.username}` : t("onboarding.profile.usernamePlaceholder")}</p>

            <div className="mt-5 space-y-3 text-sm text-slate-300">
              <p className="flex items-center gap-2">
                <Mail size={15} />
                {values.email || t("onboarding.profile.emailFallback")}
              </p>
              <p className="flex items-center gap-2">
                <Phone size={15} />
                {values.phone || t("onboarding.profile.phoneNumberFallback", { dial: countryProfile.dialCode })}
              </p>
              <p className="flex items-center gap-2">
                <MapPin size={15} />
                {values.address || t("onboarding.profile.address")}
              </p>
              <p>
                {values.city || t("onboarding.profile.city")}, {values.country || t("onboarding.profile.country")}
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
                    {link.label || t("onboarding.profile.socialFallback")}
                  </p>
                );
              })}
              {values.dateOfBirth && (
                <p className="inline-flex items-center gap-1 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-sky-100">
                  <CheckCircle2 size={13} />
                  {t("onboarding.profile.dobAdded")}
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

      <CenteredModal open={underageOpen} onClose={() => setUnderageOpen(false)} maxWidth="max-w-md" labelledBy="underage-title">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-1.5 rounded-t-3xl bg-gradient-to-r from-amber-400 via-rose-500 to-red-600" />
        <div className="flex items-start gap-3 pt-1.5">
          <span className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-amber-500 to-rose-600 text-white shadow-lg shadow-rose-500/30">
            <Cake size={28} />
          </span>
          <div className="min-w-0">
            <p className="text-[11px] font-black uppercase tracking-[0.18em] text-rose-600">{t("onboarding.profile.ageCheck")}</p>
            <h2 id="underage-title" className="mt-1 text-2xl font-black leading-tight text-slate-950">
              {t("onboarding.profile.notEligible")}
            </h2>
          </div>
        </div>

        <p className="mt-4 text-sm font-bold leading-6 text-slate-700">
          {t("onboarding.profile.underageBody", { age: MINIMUM_AGE })}
        </p>
        <p className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold leading-6 text-amber-900">
          {t("onboarding.profile.underageHint")}
        </p>

        <button
          type="button"
          onClick={() => setUnderageOpen(false)}
          className="mt-5 h-12 w-full rounded-2xl bg-slate-950 px-4 text-sm font-black text-white transition hover:bg-slate-800"
        >
          {t("onboarding.profile.underageAction")}
        </button>
      </CenteredModal>

      <div className="mt-6 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={onBack}
          className="rounded-[20px] border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
        >
          {t("onboarding.back")}
        </button>
        <button
          type="button"
          disabled={saving}
          onClick={handleContinue}
          className="rounded-[20px] bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving ? t("onboarding.saving") : t("onboarding.continue")}
        </button>
      </div>
    </OnboardingFrame>
  );
}
