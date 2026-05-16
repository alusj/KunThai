import { Building2, Clock3, MapPin, PackageCheck, Save } from "lucide-react";
import { useEffect, useState } from "react";

import {
  BUSINESS_CATEGORIES,
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
    categories: business?.identity?.categories || [],
    customCategory: "",
    country: business?.location?.country || "",
    city: business?.location?.city || "",
    address: business?.location?.address || "",
    discoverableNearby: business?.location?.discoverableNearby ?? true,
    businessType: business?.operations?.businessType || "both",
    deliveryEnabled: business?.operations?.deliveryEnabled ?? true,
    pickupEnabled: business?.operations?.pickupEnabled ?? true,
    openTime: business?.operations?.openTime || "09:00",
    closeTime: business?.operations?.closeTime || "18:00",
  };
}

function SummaryCard({ icon: Icon, label, value }) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
      <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gray-100 text-gray-800">
        <Icon size={18} />
      </span>
      <p className="mt-4 text-xs font-black uppercase tracking-[0.16em] text-gray-500">
        {label}
      </p>
      <p className="mt-1 text-base font-black text-gray-950">{value || "Not added"}</p>
    </div>
  );
}

export default function BusinessInfo({ onBack }) {
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
        if (mounted) setError(nextError.message || "Unable to load business information.");
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

  function toggleCategory(category) {
    setForm((current) => {
      const exists = current.categories.includes(category);
      if (!exists && current.categories.length >= 5) {
        setError("Choose up to 5 categories.");
        return current;
      }

      setError("");
      return {
        ...current,
        categories: exists
          ? current.categories.filter((item) => item !== category)
          : [...current.categories, category],
      };
    });
  }

  function addCustomCategory() {
    const category = form.customCategory.trim();
    if (!category) return;
    if (form.categories.includes(category)) {
      setError("This category is already selected.");
      return;
    }
    if (form.categories.length >= 5) {
      setError("Remove one category before adding another.");
      return;
    }

    setForm((current) => ({
      ...current,
      categories: [...current.categories, category],
      customCategory: "",
    }));
    setError("");
  }

  async function saveBusinessInfo(event) {
    event.preventDefault();

    if (!form.categories.length) {
      setError("Choose at least one business category.");
      return;
    }

    if (!form.city.trim() || !form.country.trim()) {
      setError("City and country are required.");
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
          categories: form.categories,
        },
        location: {
          country: form.country,
          city: form.city,
          address: form.address,
          discoverableNearby: form.discoverableNearby,
        },
        operations: {
          businessType: form.businessType,
          deliveryEnabled: form.deliveryEnabled,
          pickupEnabled: form.pickupEnabled,
          openTime: form.openTime,
          closeTime: form.closeTime,
        },
      });
      setBusiness(updated);
      setForm(buildForm(updated));
      setStatus("Business information updated successfully.");
    } catch (nextError) {
      setError(nextError.message || "Unable to update business information.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <SellerMenuPageHeader title="Business Information" eyebrow="Store Identity" onBack={onBack} />
      <div className="w-full px-4 py-5 sm:px-6 lg:px-8">
        {loading ? (
        <div className="rounded-2xl border border-gray-200 bg-white p-5 text-sm font-bold text-gray-500">
          Loading business information...
        </div>
      ) : (
        <form onSubmit={saveBusinessInfo} className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <SummaryCard
              icon={Building2}
              label="Business"
              value={business?.identity?.businessName}
            />
            <SummaryCard
              icon={MapPin}
              label="Location"
              value={[form.city, form.country].filter(Boolean).join(", ")}
            />
            <SummaryCard
              icon={PackageCheck}
              label="Fulfillment"
              value={[
                form.deliveryEnabled ? "Delivery" : "",
                form.pickupEnabled ? "Pickup" : "",
              ].filter(Boolean).join(" and ")}
            />
            <SummaryCard
              icon={Clock3}
              label="Hours"
              value={`${form.openTime || "--:--"} - ${form.closeTime || "--:--"}`}
            />
          </div>

          <section className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-black text-gray-950">Business categories</h2>
                <p className="mt-1 text-sm font-semibold text-gray-500">
                  Pick up to 5 categories so buyers can find your store.
                </p>
              </div>
              <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-black text-gray-700">
                {form.categories.length}/5 selected
              </span>
            </div>

            <div className="mt-5 flex flex-wrap gap-2">
              {BUSINESS_CATEGORIES.map((category) => {
                const selected = form.categories.includes(category);
                return (
                  <button
                    key={category}
                    type="button"
                    onClick={() => toggleCategory(category)}
                    className={`rounded-full border px-4 py-2 text-sm font-black transition ${
                      selected
                        ? "border-gray-950 bg-gray-950 text-white"
                        : "border-gray-200 bg-white text-gray-700 hover:border-gray-950"
                    }`}
                  >
                    {category}
                  </button>
                );
              })}
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-[1fr_auto]">
              <input
                className={inputClass}
                value={form.customCategory}
                placeholder="Add another category"
                onChange={(event) => updateField("customCategory", event.target.value)}
              />
              <button
                type="button"
                onClick={addCustomCategory}
                className="mt-2 rounded-xl border border-gray-950 px-5 py-3 text-sm font-black text-gray-950 transition hover:bg-gray-950 hover:text-white"
              >
                Add category
              </button>
            </div>
          </section>

          <section className="grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
            <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm sm:p-6">
              <h2 className="text-lg font-black text-gray-950">Store location</h2>
              <p className="mt-1 text-sm font-semibold text-gray-500">
                Keep this accurate for nearby discovery, delivery, and pickup.
              </p>

              <div className="mt-5 grid gap-4 md:grid-cols-2">
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
              </div>

              <label className="mt-5 flex items-center justify-between gap-3 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
                <span>
                  <span className="block text-sm font-black text-gray-950">Nearby discovery</span>
                  <span className="text-xs font-semibold text-gray-500">
                    Let buyers find this store around their location
                  </span>
                </span>
                <input
                  type="checkbox"
                  checked={form.discoverableNearby}
                  onChange={(event) => updateField("discoverableNearby", event.target.checked)}
                  className="h-5 w-5 accent-gray-950"
                />
              </label>
            </div>

            <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm sm:p-6">
              <h2 className="text-lg font-black text-gray-950">Operations</h2>
              <p className="mt-1 text-sm font-semibold text-gray-500">
                Control how buyers can receive their orders.
              </p>

              <div className="mt-5 space-y-4">
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

                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
                  <label className="flex items-center justify-between gap-3 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
                    <span className="text-sm font-black text-gray-950">Delivery</span>
                    <input
                      type="checkbox"
                      checked={form.deliveryEnabled}
                      onChange={(event) => updateField("deliveryEnabled", event.target.checked)}
                      className="h-5 w-5 accent-gray-950"
                    />
                  </label>
                  <label className="flex items-center justify-between gap-3 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
                    <span className="text-sm font-black text-gray-950">Pickup</span>
                    <input
                      type="checkbox"
                      checked={form.pickupEnabled}
                      onChange={(event) => updateField("pickupEnabled", event.target.checked)}
                      className="h-5 w-5 accent-gray-950"
                    />
                  </label>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Open time">
                    <input
                      type="time"
                      className={inputClass}
                      value={form.openTime}
                      onChange={(event) => updateField("openTime", event.target.value)}
                    />
                  </Field>
                  <Field label="Close time">
                    <input
                      type="time"
                      className={inputClass}
                      value={form.closeTime}
                      onChange={(event) => updateField("closeTime", event.target.value)}
                    />
                  </Field>
                </div>
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
              {saving ? "Saving..." : "Save business information"}
            </button>
          </div>
        </form>
        )}
      </div>
    </>
  );
}
