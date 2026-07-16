import { useMemo, useRef, useState } from "react";
import { HiOutlineBuildingOffice2, HiOutlinePhoto, HiOutlineSparkles } from "react-icons/hi2";

import {
  SPACE_CATEGORIES,
  createExploreSpace,
  normalizeSpaceSlug,
} from "../../../../Backend/services/exploreService";
import { showToast } from "../../../../Backend/services/toastService";
import Avatar from "../../shared/Avatar";

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
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState("");
  const avatarInputRef = useRef(null);
  const coverInputRef = useRef(null);
  const suggestedSlug = useMemo(() => normalizeSpaceSlug(form.slug || form.name), [form.name, form.slug]);

  function updateField(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
    setFeedback("");
  }

  async function pickImage(event, field) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      updateField(field, await fileToDataUrl(file));
    } catch (error) {
      setFeedback(error.message || "Unable to load image.");
    } finally {
      event.target.value = "";
    }
  }

  async function submitSpace(event) {
    event.preventDefault();
    if (saving) return;

    try {
      setSaving(true);
      const created = await createExploreSpace({
        ...form,
        slug: suggestedSlug,
      });
      showToast(`${created.displayName} Space created.`, "success");
      onCreated?.(created);
      setForm(INITIAL_FORM);
    } catch (error) {
      setFeedback(error.message || "Unable to create this Space.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="w-full space-y-4 px-4 py-4 sm:px-6 lg:px-8">
      {!hideHeader ? (
        <div className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-black uppercase tracking-[0.2em] text-sky-700">Explore</p>
          <h2 className="mt-1 text-2xl font-black text-slate-950">Create Space</h2>
        </div>
      ) : null}

      <form onSubmit={submitSpace} className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
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
            Cover
          </button>
          <button
            type="button"
            onClick={() => avatarInputRef.current?.click()}
            className="absolute bottom-3 left-3 rounded-full bg-white p-1 shadow-sm ring-4 ring-white/80"
            aria-label="Choose Space profile picture"
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
            <p className="text-lg font-black text-slate-950">Space identity</p>
            <p className="mt-1 text-sm font-semibold leading-6 text-slate-500">
              Create a managed identity for a business, organization, school, community, creator, or public team.
            </p>
          </div>
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <Field label="Space name">
            <input
              value={form.name}
              onChange={(event) => updateField("name", event.target.value)}
              required
              maxLength={80}
              placeholder="Sierra Universal Promoters"
              className="h-12 w-full rounded-2xl bg-slate-100 px-4 text-sm font-bold text-slate-900 outline-none focus:ring-2 focus:ring-sky-200"
            />
          </Field>
          <Field label="Handle">
            <div className="flex h-12 items-center rounded-2xl bg-slate-100 px-4 focus-within:ring-2 focus-within:ring-sky-200">
              <span className="text-sm font-black text-slate-400">@</span>
              <input
                value={form.slug}
                onChange={(event) => updateField("slug", normalizeSpaceSlug(event.target.value))}
                placeholder={suggestedSlug || "space-handle"}
                className="min-w-0 flex-1 bg-transparent pl-1 text-sm font-bold text-slate-900 outline-none"
              />
            </div>
            {suggestedSlug ? <p className="mt-1 text-xs font-bold text-slate-400">Public handle: @{suggestedSlug}</p> : null}
          </Field>
          <Field label="Type">
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
          <Field label="Location">
            <input
              value={form.location}
              onChange={(event) => updateField("location", event.target.value)}
              maxLength={120}
              placeholder="Freetown, Sierra Leone"
              className="h-12 w-full rounded-2xl bg-slate-100 px-4 text-sm font-bold text-slate-900 outline-none focus:ring-2 focus:ring-sky-200"
            />
          </Field>
          <Field label="Contact email">
            <input
              value={form.email}
              onChange={(event) => updateField("email", event.target.value)}
              type="email"
              maxLength={120}
              placeholder="team@example.com"
              className="h-12 w-full rounded-2xl bg-slate-100 px-4 text-sm font-bold text-slate-900 outline-none focus:ring-2 focus:ring-sky-200"
            />
          </Field>
          <Field label="Phone">
            <input
              value={form.phone}
              onChange={(event) => updateField("phone", event.target.value)}
              maxLength={32}
              placeholder="+232..."
              className="h-12 w-full rounded-2xl bg-slate-100 px-4 text-sm font-bold text-slate-900 outline-none focus:ring-2 focus:ring-sky-200"
            />
          </Field>
          <Field label="Website">
            <input
              value={form.websiteUrl}
              onChange={(event) => updateField("websiteUrl", event.target.value)}
              maxLength={160}
              placeholder="https://example.com"
              className="h-12 w-full rounded-2xl bg-slate-100 px-4 text-sm font-bold text-slate-900 outline-none focus:ring-2 focus:ring-sky-200"
            />
          </Field>
        </div>

        <Field label="Bio" className="mt-4">
          <textarea
            value={form.bio}
            onChange={(event) => updateField("bio", event.target.value)}
            maxLength={280}
            rows={4}
            placeholder="What should people know about this Space?"
            className="w-full resize-none rounded-2xl bg-slate-100 px-4 py-3 text-sm font-bold leading-6 text-slate-900 outline-none focus:ring-2 focus:ring-sky-200"
          />
        </Field>

        <div className="mt-5 rounded-[22px] border border-sky-100 bg-sky-50/70 p-4">
          <div className="flex items-start gap-3">
            <HiOutlineSparkles className="mt-0.5 flex-none text-xl text-sky-700" />
            <p className="text-sm font-semibold leading-6 text-slate-700">
              KunThai will create your owner role and default departments automatically. You can invite administrators, moderators, editors, customer support, and analysts after the Space exists.
            </p>
          </div>
        </div>

        {feedback ? <p className="mt-3 text-sm font-bold text-rose-600">{feedback}</p> : null}

        <button
          type="submit"
          disabled={saving || !form.name.trim()}
          className="mt-5 h-12 w-full rounded-2xl bg-slate-950 px-4 text-sm font-black text-white shadow-sm transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
        >
          {saving ? "Creating Space" : "Create Space"}
        </button>
      </form>
    </div>
  );
}

function Field({ children, className = "", label }) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-2 block text-xs font-black uppercase tracking-[0.14em] text-slate-500">{label}</span>
      {children}
    </label>
  );
}
