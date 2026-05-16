import { Save, Truck } from "lucide-react";
import { useEffect, useState } from "react";

import {
  readRegisteredBusiness,
  updateRegisteredBusinessProfile,
} from "../../../../../../../../../Backend/services/marketplace/sellerRegistrationService";
import SellerMenuPageHeader from "../../SellerMenuPageHeader";

function buildForm(business) {
  return {
    address: business?.location?.address || "",
    city: business?.location?.city || "",
    country: business?.location?.country || "",
    discoverableNearby: business?.location?.discoverableNearby ?? true,
    businessType: business?.operations?.businessType || "both",
    deliveryEnabled: business?.operations?.deliveryEnabled ?? true,
    pickupEnabled: business?.operations?.pickupEnabled ?? true,
  };
}

export default function DeliverySettings({ onBack }) {
  const [form, setForm] = useState(buildForm(null));
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("");

  useEffect(() => {
    let active = true;
    readRegisteredBusiness().then((business) => {
      if (active) setForm(buildForm(business));
    });
    return () => {
      active = false;
    };
  }, []);

  function update(field, value) {
    setStatus("");
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function save(event) {
    event.preventDefault();
    setSaving(true);
    setStatus("");
    try {
      await updateRegisteredBusinessProfile({
        location: {
          address: form.address,
          city: form.city,
          country: form.country,
          discoverableNearby: form.discoverableNearby,
        },
        operations: {
          businessType: form.businessType,
          deliveryEnabled: form.deliveryEnabled,
          pickupEnabled: form.pickupEnabled,
        },
      });
      setStatus("Delivery and pickup settings saved.");
    } catch (error) {
      setStatus(error.message || "Unable to save delivery settings.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <SellerMenuPageHeader title="Shipping & Delivery" eyebrow="Seller Board" onBack={onBack} />
      <main className="w-full px-4 py-5 sm:px-6 lg:px-8">
        <form onSubmit={save} className="space-y-5">
          <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
            <div className="flex items-start gap-3">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gray-950 text-white">
                <Truck size={22} />
              </span>
              <div>
                <h1 className="text-xl font-black text-gray-950">Fulfillment settings</h1>
                <p className="mt-2 text-sm font-semibold leading-6 text-gray-600">
                  Control how buyers receive items from your store. Clear delivery and pickup settings reduce confusion before money changes hands.
                </p>
              </div>
            </div>

            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <label>
                <span className="text-xs font-black uppercase tracking-[0.16em] text-gray-500">Business type</span>
                <select
                  value={form.businessType}
                  onChange={(event) => update("businessType", event.target.value)}
                  className="mt-2 w-full rounded-xl border border-gray-200 px-4 py-3 text-sm font-semibold outline-none focus:border-gray-950"
                >
                  <option value="both">Online and physical store</option>
                  <option value="online">Online only</option>
                  <option value="physical">Physical store only</option>
                </select>
              </label>
              <label>
                <span className="text-xs font-black uppercase tracking-[0.16em] text-gray-500">City</span>
                <input
                  value={form.city}
                  onChange={(event) => update("city", event.target.value)}
                  className="mt-2 w-full rounded-xl border border-gray-200 px-4 py-3 text-sm font-semibold outline-none focus:border-gray-950"
                />
              </label>
              <label>
                <span className="text-xs font-black uppercase tracking-[0.16em] text-gray-500">Country</span>
                <input
                  value={form.country}
                  onChange={(event) => update("country", event.target.value)}
                  className="mt-2 w-full rounded-xl border border-gray-200 px-4 py-3 text-sm font-semibold outline-none focus:border-gray-950"
                />
              </label>
              <label className="md:col-span-2">
                <span className="text-xs font-black uppercase tracking-[0.16em] text-gray-500">Pickup / store address</span>
                <textarea
                  value={form.address}
                  onChange={(event) => update("address", event.target.value)}
                  className="mt-2 min-h-28 w-full rounded-xl border border-gray-200 px-4 py-3 text-sm font-semibold outline-none focus:border-gray-950"
                />
              </label>
            </div>
          </section>

          <section className="grid gap-3 md:grid-cols-3">
            {[
              ["deliveryEnabled", "Delivery available", "Buyers can request delivery from your store."],
              ["pickupEnabled", "Pickup available", "Buyers can collect items from your pickup location."],
              ["discoverableNearby", "Nearby discovery", "Your store can appear in location-based discovery."],
            ].map(([field, title, description]) => (
              <label key={field} className="flex items-center justify-between gap-3 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
                <span>
                  <span className="block text-sm font-black text-gray-950">{title}</span>
                  <span className="text-xs font-semibold leading-5 text-gray-500">{description}</span>
                </span>
                <input
                  type="checkbox"
                  checked={Boolean(form[field])}
                  onChange={(event) => update(field, event.target.checked)}
                  className="h-5 w-5 shrink-0 accent-gray-950"
                />
              </label>
            ))}
          </section>

          {status ? <p className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm font-bold text-gray-700">{status}</p> : null}

          <button
            type="submit"
            disabled={saving}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gray-950 px-5 py-3 text-sm font-black text-white transition hover:bg-gray-800 disabled:opacity-60 sm:w-auto"
          >
            <Save size={17} />
            {saving ? "Saving..." : "Save delivery settings"}
          </button>
        </form>
      </main>
    </>
  );
}
