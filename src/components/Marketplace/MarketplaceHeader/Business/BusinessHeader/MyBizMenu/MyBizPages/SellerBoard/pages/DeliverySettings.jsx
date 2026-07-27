import { Save, Truck } from "lucide-react";
import { useEffect, useState } from "react";

import {
  readRegisteredBusiness,
  updateRegisteredBusinessProfile,
} from "../../../../../../../../../Backend/services/marketplace/sellerRegistrationService";
import { useI18n, t } from "../../../../../../../../../i18n";
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
  useI18n();
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
      setStatus(t("urmall.biz.board.delivery.saved"));
    } catch (error) {
      setStatus(error.message || t("urmall.biz.board.delivery.saveFailed"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <SellerMenuPageHeader title={t("urmall.biz.board.items.deliveryT")} eyebrow={t("urmall.biz.board.eyebrow")} onBack={onBack} />
      <main className="w-full px-4 py-5 sm:px-6 lg:px-8">
        <form onSubmit={save} className="space-y-5">
          <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
            <div className="flex items-start gap-3">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gray-950 text-white">
                <Truck size={22} />
              </span>
              <div>
                <h1 className="text-xl font-black text-gray-950">{t("urmall.biz.board.delivery.heading")}</h1>
                <p className="mt-2 text-sm font-semibold leading-6 text-gray-600">
                  {t("urmall.biz.board.delivery.hint")}
                </p>
              </div>
            </div>

            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <label>
                <span className="text-xs font-black uppercase tracking-[0.16em] text-gray-500">{t("urmall.biz.settings.businessType")}</span>
                <select
                  value={form.businessType}
                  onChange={(event) => update("businessType", event.target.value)}
                  className="mt-2 w-full rounded-xl border border-gray-200 px-4 py-3 text-sm font-semibold outline-none focus:border-gray-950"
                >
                  <option value="both">{t("urmall.biz.settings.typeBoth")}</option>
                  <option value="online">{t("urmall.biz.settings.typeOnline")}</option>
                  <option value="physical">{t("urmall.biz.settings.typePhysical")}</option>
                </select>
              </label>
              <label>
                <span className="text-xs font-black uppercase tracking-[0.16em] text-gray-500">{t("urmall.biz.settings.city")}</span>
                <input
                  value={form.city}
                  onChange={(event) => update("city", event.target.value)}
                  className="mt-2 w-full rounded-xl border border-gray-200 px-4 py-3 text-sm font-semibold outline-none focus:border-gray-950"
                />
              </label>
              <label>
                <span className="text-xs font-black uppercase tracking-[0.16em] text-gray-500">{t("urmall.biz.settings.country")}</span>
                <input
                  value={form.country}
                  onChange={(event) => update("country", event.target.value)}
                  className="mt-2 w-full rounded-xl border border-gray-200 px-4 py-3 text-sm font-semibold outline-none focus:border-gray-950"
                />
              </label>
              <label className="md:col-span-2">
                <span className="text-xs font-black uppercase tracking-[0.16em] text-gray-500">{t("urmall.biz.board.delivery.addressLabel")}</span>
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
              ["deliveryEnabled", t("urmall.biz.board.delivery.deliveryTitle"), t("urmall.biz.board.delivery.deliveryDesc")],
              ["pickupEnabled", t("urmall.biz.board.delivery.pickupTitle"), t("urmall.biz.board.delivery.pickupDesc")],
              ["discoverableNearby", t("urmall.biz.board.delivery.nearbyTitle"), t("urmall.biz.board.delivery.nearbyDesc")],
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
            {saving ? t("urmall.biz.saving") : t("urmall.biz.board.delivery.save")}
          </button>
        </form>
      </main>
    </>
  );
}
