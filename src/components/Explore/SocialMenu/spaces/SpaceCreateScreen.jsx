import { useMemo, useRef, useState } from "react";
import { HiOutlineBuildingOffice2, HiOutlinePhoto, HiOutlineSparkles } from "react-icons/hi2";

import {
  SPACE_CATEGORIES,
  createExploreSpace,
  normalizeSpaceSlug,
} from "../../../../Backend/services/exploreService";
import { showToast } from "../../../../Backend/services/toastService";
import { scrollToFirstBlockingFieldSoon } from "../../../shared/formValidationNavigation";
import Avatar from "../../shared/Avatar";
import { t as i18nText } from "../../../../i18n/index";

const INITIAL_FORM = {
  name: "",
  slug: "",
  category: "business",
  bio: "",
  email: "",
  phone: "",
  websiteUrl: "",
  location: "",
  avatarUrl: "",
  coverUrl: "preset:gradient",
};

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Unable to read image."));
    reader.readAsDataURL(file);
  });
}

export default function SpaceCreateScreen({ hideHeader = false, onCreated }) {
  const [form, setForm] = useState(INITIAL_FORM);
  const [fieldErrors, setFieldErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState("");
  const formRef = useRef(null);
  const avatarInputRef = useRef(null);
  const coverInputRef = useRef(null);
  const suggestedSlug = useMemo(() => normalizeSpaceSlug(form.slug || form.name), [form.name, form.slug]);

  function updateField(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
    setFieldErrors((current) => {
      if (!current[field]) return current;
      const next = { ...current };
      delete next[field];
      return next;
    });
    setFeedback("");
  }

  function validateSpaceForm() {
    const nextErrors = {};
    if (!form.name.trim()) nextErrors.name = "Space name required.";
    if (form.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
      nextErrors.email = "Enter a valid contact email.";
    }
    if (form.websiteUrl.trim()) {
      try {
        new URL(form.websiteUrl.trim());
      } catch {
        nextErrors.websiteUrl = "Enter a valid website link.";
      }
    }
    return nextErrors;
  }

  async function pickImage(event, field) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      updateField(field, await fileToDataUrl(file));
    } catch (error) {
      setFeedback(error.message || i18nText("ui.literals.k46fb4c1c6a09"));
    } finally {
      event.target.value = "";
    }
  }

  async function submitSpace(event) {
    event.preventDefault();
    if (saving) return;

    const nextErrors = validateSpaceForm();
    setFieldErrors(nextErrors);
    if (Object.keys(nextErrors).length) {
      scrollToFirstBlockingFieldSoon(formRef.current);
      return;
    }

    try {
      setSaving(true);
      const created = await createExploreSpace({
        ...form,
        slug: suggestedSlug,
      });
      showToast(i18nText("ui.literals.k451e8fbf008a", { value0: created.displayName }), "success");
      onCreated?.(created);
      setForm(INITIAL_FORM);
    } catch (error) {
      setFeedback(error.message || i18nText("ui.literals.kfc2284587edd"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="w-full space-y-4 px-4 py-4 sm:px-6 lg:px-8">
      {!hideHeader ? (
        <div className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-black uppercase tracking-[0.2em] text-sky-700">Explore</p>
          <h2 className="mt-1 text-2xl font-black text-slate-950">{i18nText("ui.literals.kb50606b40277")}</h2>
        </div>
      ) : null}

      <form ref={formRef} onSubmit={submitSpace} noValidate className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
        <div
          className="relative mb-5 h-32 overflow-hidden rounded-[24px] border border-slate-200 bg-slate-100"
          style={{
            backgroundImage: form.coverUrl?.startsWith("data:")
              ? `linear-gradient(120deg, rgba(15,23,42,0.10), rgba(255,255,255,0.12)), url("${form.coverUrl}")`
              : "linear-gradient(120deg, #dff4ff 0%, #ffffff 52%, #eef2f7 100%)",
            backgroundSize: "cover",
            backgroundPosition: "center",
          }}
        >
          <button
            type="button"
            onClick={() => coverInputRef.current?.click()}
            className="absolute right-3 top-3 inline-flex items-center gap-2 rounded-2xl bg-white/95 px-3 py-2 text-xs font-black text-slate-700 shadow-sm"
          >
            <HiOutlinePhoto />
            {i18nText("ui.literals.k8b656a5dd9d5")}
          </button>
          <button
            type="button"
            onClick={() => avatarInputRef.current?.click()}
            className="absolute bottom-3 left-3 rounded-full bg-white p-1 shadow-sm ring-4 ring-white/80"
            aria-label={i18nText("ui.literals.k3259c1700363")}
          >
            <Avatar name={form.name || "Space"} src={form.avatarUrl} size="lg" />
          </button>
          <input ref={avatarInputRef} type="file" accept="image/*" onChange={(event) => pickImage(event, "avatarUrl")} className="hidden" />
          <input ref={coverInputRef} type="file" accept="image/*" onChange={(event) => pickImage(event, "coverUrl")} className="hidden" />
        </div>

        <div className="flex items-start gap-3">
          <span className="grid h-12 w-12 flex-none place-items-center rounded-2xl bg-sky-50 text-xl text-sky-700">
            <HiOutlineBuildingOffice2 />
          </span>
          <div className="min-w-0">
            <p className="text-lg font-black text-slate-950">{i18nText("ui.literals.k362b25c1e9e6")}</p>
            <p className="mt-1 text-sm font-semibold leading-6 text-slate-500">
              {i18nText("ui.literals.kd10cb3816775")}
            </p>
          </div>
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <Field label={i18nText("ui.literals.k28f9e0c55be1")} error={fieldErrors.name}>
            <input
              value={form.name}
              onChange={(event) => updateField("name", event.target.value)}
              maxLength={80}
              placeholder={i18nText("ui.literals.ka54e5aa76994")}
              aria-invalid={fieldErrors.name ? "true" : undefined}
              className={`h-12 w-full rounded-2xl border bg-slate-100 px-4 text-sm font-bold text-slate-900 outline-none focus:ring-2 focus:ring-sky-200 ${fieldErrors.name ? "border-rose-300" : "border-transparent"}`}
            />
          </Field>
          <Field label={i18nText("ui.literals.kc0392b2b1c47")}>
            <div className="flex h-12 items-center rounded-2xl bg-slate-100 px-4 focus-within:ring-2 focus-within:ring-sky-200">
              <span className="text-sm font-black text-slate-400">@</span>
              <input
                value={form.slug}
                onChange={(event) => updateField("slug", normalizeSpaceSlug(event.target.value))}
                placeholder={suggestedSlug || i18nText("ui.literals.k0d766b9585da")}
                className="min-w-0 flex-1 bg-transparent pl-1 text-sm font-bold text-slate-900 outline-none"
              />
            </div>
            {suggestedSlug ? <p className="mt-1 text-xs font-bold text-slate-400">{i18nText("ui.literals.k1875a2080ace")}{suggestedSlug}</p> : null}
          </Field>
          <Field label={i18nText("ui.literals.k3deb74565196")}>
            <select
              value={form.category}
              onChange={(event) => updateField("category", event.target.value)}
              className="h-12 w-full rounded-2xl bg-slate-100 px-4 text-sm font-bold text-slate-900 outline-none focus:ring-2 focus:ring-sky-200"
            >
              {SPACE_CATEGORIES.map((category) => (
                <option key={category.id} value={category.id}>{category.label}</option>
              ))}
            </select>
          </Field>
          <Field label={i18nText("ui.literals.kd219c68101f5")}>
            <input
              value={form.location}
              onChange={(event) => updateField("location", event.target.value)}
              maxLength={120}
              placeholder={i18nText("ui.literals.k6fb4e27edc8d")}
              className="h-12 w-full rounded-2xl bg-slate-100 px-4 text-sm font-bold text-slate-900 outline-none focus:ring-2 focus:ring-sky-200"
            />
          </Field>
          <Field label={i18nText("ui.literals.k726a1ceebd2e")} error={fieldErrors.email}>
            <input
              value={form.email}
              onChange={(event) => updateField("email", event.target.value)}
              type="email"
              maxLength={120}
              placeholder={i18nText("ui.literals.k5c9394b3c020")}
              aria-invalid={fieldErrors.email ? "true" : undefined}
              className={`h-12 w-full rounded-2xl border bg-slate-100 px-4 text-sm font-bold text-slate-900 outline-none focus:ring-2 focus:ring-sky-200 ${fieldErrors.email ? "border-rose-300" : "border-transparent"}`}
            />
          </Field>
          <Field label={i18nText("ui.literals.k77064d526523")}>
            <input
              value={form.phone}
              onChange={(event) => updateField("phone", event.target.value)}
              maxLength={32}
              placeholder="+232..."
              className="h-12 w-full rounded-2xl bg-slate-100 px-4 text-sm font-bold text-slate-900 outline-none focus:ring-2 focus:ring-sky-200"
            />
          </Field>
          <Field label={i18nText("ui.literals.k2e8a57cc5c47")} error={fieldErrors.websiteUrl}>
            <input
              value={form.websiteUrl}
              onChange={(event) => updateField("websiteUrl", event.target.value)}
              maxLength={160}
              placeholder="https://example.com"
              aria-invalid={fieldErrors.websiteUrl ? "true" : undefined}
              className={`h-12 w-full rounded-2xl border bg-slate-100 px-4 text-sm font-bold text-slate-900 outline-none focus:ring-2 focus:ring-sky-200 ${fieldErrors.websiteUrl ? "border-rose-300" : "border-transparent"}`}
            />
          </Field>
        </div>

        <Field label={i18nText("ui.literals.kb31fc969b488")} className="mt-4">
          <textarea
            value={form.bio}
            onChange={(event) => updateField("bio", event.target.value)}
            maxLength={280}
            rows={4}
            placeholder={i18nText("ui.literals.k41aac5cc1c5e")}
            className="w-full resize-none rounded-2xl bg-slate-100 px-4 py-3 text-sm font-bold leading-6 text-slate-900 outline-none focus:ring-2 focus:ring-sky-200"
          />
        </Field>

        <div className="mt-5 rounded-[22px] border border-sky-100 bg-sky-50/70 p-4">
          <div className="flex items-start gap-3">
            <HiOutlineSparkles className="mt-0.5 flex-none text-xl text-sky-700" />
            <p className="text-sm font-semibold leading-6 text-slate-700">
              {i18nText("ui.literals.k1fe95917c190")}
            </p>
          </div>
        </div>

        {feedback ? <p className="mt-3 text-sm font-bold text-rose-600">{feedback}</p> : null}

        <button
          type="submit"
          disabled={saving}
          className="mt-5 h-12 w-full rounded-2xl bg-slate-950 px-4 text-sm font-black text-white shadow-sm transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
        >
          {saving ? i18nText("ui.literals.k8bf6e4dcce63") : i18nText("ui.literals.kb50606b40277")}
        </button>
      </form>
    </div>
  );
}

function Field({ children, className = "", error, label }) {
  return (
    <label className={`block ${className}`} data-field-error={error ? "true" : undefined}>
      <span className="mb-2 block text-xs font-black uppercase tracking-[0.14em] text-slate-500">{label}</span>
      {children}
      {error ? <span className="mt-2 block text-xs font-black text-rose-600" role="alert">{error}</span> : null}
    </label>
  );
}
