import { CalendarDays, Clock3, Moon, Save, Sun } from "lucide-react";
import { useEffect, useState } from "react";

import {
  readRegisteredBusiness,
  updateRegisteredBusinessProfile,
} from "../../../../../../../../../Backend/services/marketplace/sellerRegistrationService";
import SellerMenuPageHeader from "../../SellerMenuPageHeader";

const DAYS = [
  { key: "Mon", label: "Monday" },
  { key: "Tue", label: "Tuesday" },
  { key: "Wed", label: "Wednesday" },
  { key: "Thu", label: "Thursday" },
  { key: "Fri", label: "Friday" },
  { key: "Sat", label: "Saturday" },
  { key: "Sun", label: "Sunday" },
];

const inputClass =
  "mt-2 w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm font-semibold text-gray-950 outline-none transition focus:border-gray-950 focus:ring-4 focus:ring-gray-950/10";
const labelClass = "text-xs font-black uppercase tracking-[0.16em] text-gray-500";

function buildForm(business) {
  return {
    operatingDays: business?.operations?.operatingDays?.length
      ? business.operations.operatingDays
      : ["Mon", "Tue", "Wed", "Thu", "Fri"],
    openTime: business?.operations?.openTime || "09:00",
    closeTime: business?.operations?.closeTime || "18:00",
    deliveryEnabled: business?.operations?.deliveryEnabled ?? true,
    pickupEnabled: business?.operations?.pickupEnabled ?? true,
  };
}

function formatTime(value) {
  if (!value) return "--:--";
  const [hour, minute] = value.split(":");
  const date = new Date();
  date.setHours(Number(hour || 0), Number(minute || 0), 0, 0);
  return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

export default function OperatingHours({ onBack }) {
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
        if (mounted) setError(nextError.message || "Unable to load operating hours.");
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

  function toggleDay(day) {
    setStatus("");
    setError("");
    setForm((current) => {
      const exists = current.operatingDays.includes(day);
      return {
        ...current,
        operatingDays: exists
          ? current.operatingDays.filter((item) => item !== day)
          : [...current.operatingDays, day],
      };
    });
  }

  function setWeekdays() {
    updateField("operatingDays", ["Mon", "Tue", "Wed", "Thu", "Fri"]);
  }

  function setEveryday() {
    updateField("operatingDays", DAYS.map((day) => day.key));
  }

  async function saveHours(event) {
    event.preventDefault();

    if (!form.operatingDays.length) {
      setError("Choose at least one open day.");
      return;
    }

    if (!form.openTime || !form.closeTime) {
      setError("Open and close time are required.");
      return;
    }

    setSaving(true);
    setError("");
    setStatus("");
    try {
      const updated = await updateRegisteredBusinessProfile({
        operations: {
          operatingDays: form.operatingDays,
          openTime: form.openTime,
          closeTime: form.closeTime,
          deliveryEnabled: form.deliveryEnabled,
          pickupEnabled: form.pickupEnabled,
        },
      });
      setForm(buildForm(updated));
      setStatus("Operating hours updated successfully.");
    } catch (nextError) {
      setError(nextError.message || "Unable to update operating hours.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <SellerMenuPageHeader title="Operating Hours" eyebrow="Store Settings" onBack={onBack} />
      <div className="w-full px-4 py-5 sm:px-6 lg:px-8">
        {loading ? (
        <div className="rounded-2xl border border-gray-200 bg-white p-5 text-sm font-bold text-gray-500">
          Loading operating hours...
        </div>
      ) : (
        <form onSubmit={saveHours} className="space-y-5">
          <section className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
              <Sun className="text-amber-600" size={22} />
              <p className="mt-4 text-xs font-black uppercase tracking-[0.16em] text-gray-500">
                Opens
              </p>
              <p className="mt-1 text-xl font-black text-gray-950">{formatTime(form.openTime)}</p>
            </div>
            <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
              <Moon className="text-indigo-600" size={22} />
              <p className="mt-4 text-xs font-black uppercase tracking-[0.16em] text-gray-500">
                Closes
              </p>
              <p className="mt-1 text-xl font-black text-gray-950">{formatTime(form.closeTime)}</p>
            </div>
            <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
              <CalendarDays className="text-emerald-700" size={22} />
              <p className="mt-4 text-xs font-black uppercase tracking-[0.16em] text-gray-500">
                Open days
              </p>
              <p className="mt-1 text-xl font-black text-gray-950">{form.operatingDays.length} days</p>
            </div>
          </section>

          <section className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gray-950 text-white">
                  <Clock3 size={19} />
                </span>
                <div>
                  <h2 className="text-lg font-black text-gray-950">Opening schedule</h2>
                  <p className="mt-1 text-sm font-semibold text-gray-500">
                    Set when buyers can reach your store for support, pickup, and delivery.
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={setWeekdays}
                  className="rounded-full border border-gray-200 px-3 py-2 text-xs font-black text-gray-700 transition hover:border-gray-950"
                >
                  Weekdays
                </button>
                <button
                  type="button"
                  onClick={setEveryday}
                  className="rounded-full border border-gray-200 px-3 py-2 text-xs font-black text-gray-700 transition hover:border-gray-950"
                >
                  Every day
                </button>
              </div>
            </div>

            <div className="mt-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {DAYS.map((day) => {
                const selected = form.operatingDays.includes(day.key);
                return (
                  <button
                    key={day.key}
                    type="button"
                    onClick={() => toggleDay(day.key)}
                    className={`min-h-14 rounded-xl border px-4 py-3 text-left transition ${
                      selected
                        ? "border-gray-950 bg-gray-950 text-white"
                        : "border-gray-200 bg-white text-gray-700 hover:border-gray-950"
                    }`}
                  >
                    <span className="block text-sm font-black">{day.label}</span>
                    <span className={`text-xs font-semibold ${selected ? "text-white/70" : "text-gray-500"}`}>
                      {selected ? "Open" : "Closed"}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <label>
                <span className={labelClass}>Open time</span>
                <input
                  type="time"
                  className={inputClass}
                  value={form.openTime}
                  onChange={(event) => updateField("openTime", event.target.value)}
                />
              </label>
              <label>
                <span className={labelClass}>Close time</span>
                <input
                  type="time"
                  className={inputClass}
                  value={form.closeTime}
                  onChange={(event) => updateField("closeTime", event.target.value)}
                />
              </label>
            </div>
          </section>

          <section className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm sm:p-6">
            <h2 className="text-lg font-black text-gray-950">Service availability</h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <label className="flex items-center justify-between gap-3 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
                <span>
                  <span className="block text-sm font-black text-gray-950">Delivery during open hours</span>
                  <span className="text-xs font-semibold text-gray-500">Buyers can request delivery when the store is open</span>
                </span>
                <input
                  type="checkbox"
                  checked={form.deliveryEnabled}
                  onChange={(event) => updateField("deliveryEnabled", event.target.checked)}
                  className="h-5 w-5 shrink-0 accent-gray-950"
                />
              </label>
              <label className="flex items-center justify-between gap-3 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
                <span>
                  <span className="block text-sm font-black text-gray-950">Pickup during open hours</span>
                  <span className="text-xs font-semibold text-gray-500">Buyers can arrange pickup when the store is open</span>
                </span>
                <input
                  type="checkbox"
                  checked={form.pickupEnabled}
                  onChange={(event) => updateField("pickupEnabled", event.target.checked)}
                  className="h-5 w-5 shrink-0 accent-gray-950"
                />
              </label>
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
              {saving ? "Saving..." : "Save operating hours"}
            </button>
          </div>
        </form>
        )}
      </div>
    </>
  );
}
