import { Mail, MapPin, Phone, Save, Store, Truck } from "lucide-react";
import { useEffect, useState } from "react";

import {
  readRegisteredBusiness,
  updateRegisteredBusinessProfile,
} from "../../../../../../../../../Backend/services/marketplace/sellerRegistrationService";
import SellerMenuPageHeader from "../../SellerMenuPageHeader";

const inputClass =
  "mt-2 w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm font-semibold text-gray-950 outline-none transition focus:border-gray-950 focus:ring-4 focus:ring-gray-950/10";
const labelClass = "text-xs font-black uppercase tracking-[0.16em] text-gray-500";

function Field({ label, children }) {
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
    country: business?.location?.country || "",
    city: business?.location?.city || "",
    address: business?.location?.address || "",
    phone: business?.location?.phone || "",
    email: business?.location?.email || "",
    website: business?.location?.website || "",
    whatsappEnabled: Boolean(business?.location?.whatsappEnabled),
    whatsapp: business?.location?.whatsapp || "",
    discoverableNearby: business?.location?.discoverableNearby ?? true,
    businessType: business?.operations?.businessType || "both",
    deliveryEnabled: business?.operations?.deliveryEnabled ?? true,
    pickupEnabled: business?.operations?.pickupEnabled ?? true,
  };
}

export default function StoreDetails({ onBack }) {
  const [form, setForm] = useState(buildForm(null));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let mounted = true;
    readRegisteredBusiness()
      .then((business) => {
        if (mounted) setForm(buildForm(business));
      })
      .catch((nextError) => {
        if (mounted) setError(nextError.message || "Unable to load store details.");
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

  async function saveStoreDetails(event) {
    event.preventDefault();

    if (!form.businessName.trim() || !form.phone.trim() || !form.email.trim()) {
      setError("Business name, phone number, and email are required.");
      return;
    }

    if (!form.deliveryEnabled && !form.pickupEnabled) {
      setError("Enable delivery, pickup, or both.");
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
        },
        location: {
          country: form.country,
          city: form.city,
          address: form.address,
          phone: form.phone,
          email: form.email,
          website: form.website,
          whatsappEnabled: form.whatsappEnabled,
          whatsapp: form.whatsapp,
          discoverableNearby: form.discoverableNearby,
        },
        operations: {
          businessType: form.businessType,
          deliveryEnabled: form.deliveryEnabled,
          pickupEnabled: form.pickupEnabled,
        },
      });
      setForm(buildForm(updated));
      setStatus("Store details updated successfully.");
    } catch (nextError) {
      setError(nextError.message || "Unable to update store details.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <SellerMenuPageHeader title="Store Details" eyebrow="Store Settings" onBack={onBack} />
      <div className="w-full px-4 py-5 sm:px-6 lg:px-8">
        {loading ? (
        <div className="rounded-2xl border border-gray-200 bg-white p-5 text-sm font-bold text-gray-500">
          Loading store details...
        </div>
      ) : (
        <form onSubmit={saveStoreDetails} className="space-y-5">
          <section className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm sm:p-6">
            <div className="mb-5 flex items-center gap-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-gray-950 text-white">
                <Store size={19} />
              </span>
              <div>
                <h2 className="text-lg font-black text-gray-950">Public store profile</h2>
                <p className="text-sm font-semibold text-gray-500">
                  Buyers see these details when they visit your products.
                </p>
              </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <Field label="Store name">
                <input
                  className={inputClass}
                  value={form.businessName}
                  onChange={(event) => updateField("businessName", event.target.value)}
                />
              </Field>
              <Field label="Business type">
                <select
                  className={inputClass}
                  value={form.businessType}
                  onChange={(event) => updateField("businessType", event.target.value)}
                >
                  <option value="both">Online and physical store</option>
                  <option value="online">Online only</option>
                  <option value="physical">Physical store only</option>
                </select>
              </Field>
              <div className="lg:col-span-2">
                <Field label="Description">
                  <textarea
                    className={`${inputClass} min-h-32 resize-y`}
                    value={form.description}
                    onChange={(event) => updateField("description", event.target.value)}
                  />
                </Field>
              </div>
            </div>
          </section>

          <section className="grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
            <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm sm:p-6">
              <div className="mb-5 flex items-center gap-3">
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-gray-100 text-gray-800">
                  <MapPin size={19} />
                </span>
                <div>
                  <h2 className="text-lg font-black text-gray-950">Address and contact</h2>
                  <p className="text-sm font-semibold text-gray-500">
                    Keep contact information accurate for buyer trust.
                  </p>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Country">
                  <input
                    className={inputClass}
                    value={form.country}
                    onChange={(event) => updateField("country", event.target.value)}
                  />
                </Field>
                <Field label="City">
                  <input
                    className={inputClass}
                    value={form.city}
                    onChange={(event) => updateField("city", event.target.value)}
                  />
                </Field>
                <div className="md:col-span-2">
                  <Field label="Store address">
                    <textarea
                      className={`${inputClass} min-h-28 resize-y`}
                      value={form.address}
                      onChange={(event) => updateField("address", event.target.value)}
                    />
                  </Field>
                </div>
                <Field label="Phone">
                  <div className="relative">
                    <Phone className="absolute left-4 top-1/2 mt-1 text-gray-400" size={18} />
                    <input
                      className={`${inputClass} pl-11`}
                      value={form.phone}
                      onChange={(event) => updateField("phone", event.target.value)}
                    />
                  </div>
                </Field>
                <Field label="Email">
                  <div className="relative">
                    <Mail className="absolute left-4 top-1/2 mt-1 text-gray-400" size={18} />
                    <input
                      className={`${inputClass} pl-11`}
                      type="email"
                      value={form.email}
                      onChange={(event) => updateField("email", event.target.value)}
                    />
                  </div>
                </Field>
                <Field label="Website">
                  <input
                    className={inputClass}
                    value={form.website}
                    placeholder="https://"
                    onChange={(event) => updateField("website", event.target.value)}
                  />
                </Field>
                <Field label="WhatsApp">
                  <input
                    className={inputClass}
                    value={form.whatsapp}
                    onChange={(event) => updateField("whatsapp", event.target.value)}
                  />
                </Field>
              </div>
            </div>

            <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm sm:p-6">
              <div className="mb-5 flex items-center gap-3">
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-gray-100 text-gray-800">
                  <Truck size={19} />
                </span>
                <div>
                  <h2 className="text-lg font-black text-gray-950">Buyer access</h2>
                  <p className="text-sm font-semibold text-gray-500">
                    Decide how buyers contact and receive orders.
                  </p>
                </div>
              </div>

              <div className="space-y-3">
                {[
                  ["deliveryEnabled", "Delivery available", "Buyers can request delivery from this store."],
                  ["pickupEnabled", "Pickup available", "Buyers can arrange pickup from your location."],
                  ["whatsappEnabled", "WhatsApp contact", "Show WhatsApp as a contact option."],
                  ["discoverableNearby", "Nearby discovery", "Show this store in nearby marketplace discovery."],
                ].map(([field, title, description]) => (
                  <label
                    key={field}
                    className="flex items-center justify-between gap-3 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3"
                  >
                    <span>
                      <span className="block text-sm font-black text-gray-950">{title}</span>
                      <span className="text-xs font-semibold text-gray-500">{description}</span>
                    </span>
                    <input
                      type="checkbox"
                      checked={Boolean(form[field])}
                      onChange={(event) => updateField(field, event.target.checked)}
                      className="h-5 w-5 shrink-0 accent-gray-950"
                    />
                  </label>
                ))}
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
              {saving ? "Saving..." : "Save store details"}
            </button>
          </div>
        </form>
        )}
      </div>
    </>
  );
}
