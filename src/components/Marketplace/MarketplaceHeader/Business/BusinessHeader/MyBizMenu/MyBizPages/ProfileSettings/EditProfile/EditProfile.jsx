import { Camera, Mail, Phone, Save, Store, Upload, UserRound } from "lucide-react";
import { useEffect, useState } from "react";

import {
  readRegisteredBusiness,
  updateRegisteredBusinessProfile,
} from "../../../../../../../../../Backend/services/marketplace/sellerRegistrationService";
import SellerMenuPageHeader from "../../SellerMenuPageHeader";

const inputClass =
  "mt-2 w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm font-semibold text-gray-950 outline-none transition focus:border-gray-950 focus:ring-4 focus:ring-gray-950/10";
const labelClass = "text-xs font-black uppercase tracking-[0.16em] text-gray-500";

function ProfileField({ label, children }) {
  return (
    <label className="block">
      <span className={labelClass}>{label}</span>
      {children}
    </label>
  );
}

function buildForm(business) {
  return {
    businessName: business?.identity?.businessName || "",
    description: business?.identity?.description || "",
    phone: business?.location?.phone || "",
    whatsappEnabled: Boolean(business?.location?.whatsappEnabled),
    whatsapp: business?.location?.whatsapp || "",
    email: business?.location?.email || "",
    website: business?.location?.website || "",
    logoFile: null,
    bannerFile: null,
  };
}

export default function EditProfile({ onBack }) {
  const [business, setBusiness] = useState(null);
  const [form, setForm] = useState(buildForm(null));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let mounted = true;

    readRegisteredBusiness()
      .then((nextBusiness) => {
        if (!mounted) return;
        setBusiness(nextBusiness);
        setForm(buildForm(nextBusiness));
      })
      .catch((nextError) => {
        if (mounted) setError(nextError.message || "Unable to load seller profile.");
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, []);

  function updateField(field, value) {
    setStatus("");
    setError("");
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function saveProfile(event) {
    event.preventDefault();

    if (!form.businessName.trim()) {
      setError("Business name is required.");
      return;
    }

    if (!form.phone.trim() || !form.email.trim()) {
      setError("Phone number and email are required.");
      return;
    }

    setSaving(true);
    setError("");
    setStatus("");
    try {
      const updated = await updateRegisteredBusinessProfile({
        identity: {
          businessName: form.businessName,
          description: form.description,
          logoFile: form.logoFile,
          bannerFile: form.bannerFile,
        },
        location: {
          phone: form.phone,
          whatsappEnabled: form.whatsappEnabled,
          whatsapp: form.whatsapp,
          email: form.email,
          website: form.website,
        },
      });
      setBusiness(updated);
      setForm(buildForm(updated));
      setStatus("Profile updated successfully.");
    } catch (nextError) {
      setError(nextError.message || "Unable to update profile.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <SellerMenuPageHeader title="Edit Profile" eyebrow="Seller Profile" onBack={onBack} />
      <div className="w-full px-4 py-5 sm:px-6 lg:px-8">
        {loading ? (
        <div className="rounded-2xl border border-gray-200 bg-white p-5 text-sm font-bold text-gray-500">
          Loading seller profile...
        </div>
      ) : (
        <form onSubmit={saveProfile} className="space-y-5">
          <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
            <div className="relative h-28 bg-gray-950 sm:h-40">
              {business?.identity?.bannerUrl ? (
                <img
                  src={business.identity.bannerUrl}
                  alt=""
                  className="h-full w-full object-cover opacity-80"
                />
              ) : null}
            </div>

            <div className="grid gap-5 p-4 sm:p-6 lg:grid-cols-[220px_1fr]">
              <div className="-mt-14 sm:-mt-20">
                <div className="flex h-28 w-28 items-center justify-center overflow-hidden rounded-2xl border-4 border-white bg-gray-100 text-2xl font-black text-gray-700 shadow-md sm:h-36 sm:w-36">
                  {business?.identity?.logoUrl ? (
                    <img
                      src={business.identity.logoUrl}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <Store size={32} />
                  )}
                </div>
                <p className="mt-3 text-sm font-black text-gray-950">
                  {business?.identity?.businessName || "Seller profile"}
                </p>
                <p className="text-xs font-semibold text-gray-500">
                  {business?.verificationStatus || "pending"} verification
                </p>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <ProfileField label="Logo">
                  <label className="mt-2 flex min-h-24 cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-gray-300 bg-gray-50 px-4 py-4 text-center transition hover:border-gray-950">
                    <Camera size={20} className="text-gray-700" />
                    <span className="mt-2 text-sm font-black text-gray-950">
                      {form.logoFile?.name || "Upload new logo"}
                    </span>
                    <input
                      type="file"
                      accept="image/*"
                      className="sr-only"
                      onChange={(event) => updateField("logoFile", event.target.files?.[0] || null)}
                    />
                  </label>
                </ProfileField>

                <ProfileField label="Banner">
                  <label className="mt-2 flex min-h-24 cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-gray-300 bg-gray-50 px-4 py-4 text-center transition hover:border-gray-950">
                    <Upload size={20} className="text-gray-700" />
                    <span className="mt-2 text-sm font-black text-gray-950">
                      {form.bannerFile?.name || "Upload new banner"}
                    </span>
                    <input
                      type="file"
                      accept="image/*"
                      className="sr-only"
                      onChange={(event) => updateField("bannerFile", event.target.files?.[0] || null)}
                    />
                  </label>
                </ProfileField>
              </div>
            </div>
          </section>

          <section className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm sm:p-6">
            <div className="mb-5 flex items-center gap-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-gray-950 text-white">
                <UserRound size={19} />
              </span>
              <div>
                <h2 className="text-lg font-black text-gray-950">Public seller details</h2>
                <p className="text-sm font-semibold text-gray-500">
                  This is what buyers see on products and your seller page.
                </p>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <ProfileField label="Business name">
                <input
                  className={inputClass}
                  value={form.businessName}
                  onChange={(event) => updateField("businessName", event.target.value)}
                />
              </ProfileField>

              <ProfileField label="Email">
                <div className="relative">
                  <Mail className="absolute left-4 top-1/2 mt-1 text-gray-400" size={18} />
                  <input
                    className={`${inputClass} pl-11`}
                    type="email"
                    value={form.email}
                    onChange={(event) => updateField("email", event.target.value)}
                  />
                </div>
              </ProfileField>

              <ProfileField label="Phone number">
                <div className="relative">
                  <Phone className="absolute left-4 top-1/2 mt-1 text-gray-400" size={18} />
                  <input
                    className={`${inputClass} pl-11`}
                    value={form.phone}
                    onChange={(event) => updateField("phone", event.target.value)}
                  />
                </div>
              </ProfileField>

              <ProfileField label="Website">
                <input
                  className={inputClass}
                  value={form.website}
                  placeholder="https://"
                  onChange={(event) => updateField("website", event.target.value)}
                />
              </ProfileField>

              <ProfileField label="WhatsApp">
                <input
                  className={inputClass}
                  value={form.whatsapp}
                  onChange={(event) => updateField("whatsapp", event.target.value)}
                />
              </ProfileField>

              <label className="mt-7 flex items-center justify-between gap-3 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
                <span>
                  <span className="block text-sm font-black text-gray-950">Enable WhatsApp</span>
                  <span className="text-xs font-semibold text-gray-500">Show WhatsApp contact to buyers</span>
                </span>
                <input
                  type="checkbox"
                  checked={form.whatsappEnabled}
                  onChange={(event) => updateField("whatsappEnabled", event.target.checked)}
                  className="h-5 w-5 accent-gray-950"
                />
              </label>

              <div className="md:col-span-2">
                <ProfileField label="Seller description">
                  <textarea
                    className={`${inputClass} min-h-32 resize-y`}
                    value={form.description}
                    onChange={(event) => updateField("description", event.target.value)}
                  />
                </ProfileField>
              </div>
            </div>
          </section>

          {error ? (
            <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">
              {error}
            </p>
          ) : null}
          {status ? (
            <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-700">
              {status}
            </p>
          ) : null}

          <div className="sticky bottom-3 z-10 flex justify-end">
            <button
              type="submit"
              disabled={saving}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gray-950 px-5 py-3 text-sm font-black text-white shadow-lg shadow-gray-950/15 transition hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
            >
              <Save size={18} />
              {saving ? "Saving..." : "Save profile"}
            </button>
          </div>
        </form>
        )}
      </div>
    </>
  );
}
