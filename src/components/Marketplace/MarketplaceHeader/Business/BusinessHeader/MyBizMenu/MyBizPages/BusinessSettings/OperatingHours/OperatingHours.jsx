import { CalendarDays, Clock3, Moon, Save, Sun } from "lucide-react";
import { useEffect, useState } from "react";

import {
  readRegisteredBusiness,
  updateRegisteredBusinessProfile,
} from "../../../../../../../../../Backend/services/marketplace/sellerRegistrationService";
import { useI18n, t } from "../../../../../../../../../i18n";
import SellerMenuPageHeader from "../../SellerMenuPageHeader";

const DAYS = [
  { key: "Mon", labelKey: "urmall.biz.settings.dayMon" },
  { key: "Tue", labelKey: "urmall.biz.settings.dayTue" },
  { key: "Wed", labelKey: "urmall.biz.settings.dayWed" },
  { key: "Thu", labelKey: "urmall.biz.settings.dayThu" },
  { key: "Fri", labelKey: "urmall.biz.settings.dayFri" },
  { key: "Sat", labelKey: "urmall.biz.settings.daySat" },
  { key: "Sun", labelKey: "urmall.biz.settings.daySun" },
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
  useI18n();
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
        if (mounted) setError(nextError.message || t("urmall.biz.settings.hoursLoadFailed"));
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
      setError(t("urmall.biz.settings.chooseOpenDay"));
      return;
    }

    if (!form.openTime || !form.closeTime) {
      setError(t("urmall.biz.settings.timeRequired"));
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
      setStatus(t("urmall.biz.settings.hoursUpdated"));
    } catch (nextError) {
      setError(nextError.message || t("urmall.biz.settings.hoursUpdateFailed"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <SellerMenuPageHeader title={t("urmall.biz.settings.hoursTitle")} eyebrow={t("urmall.biz.menu.storeSettingsTitle")} onBack={onBack} />
      <div className="w-full px-4 py-5 sm:px-6 lg:px-8">
        {loading ? (
        <div className="rounded-2xl border border-gray-200 bg-white p-5 text-sm font-bold text-gray-500">
          {t("urmall.biz.settings.loadingHours")}
        </div>
      ) : (
        <form onSubmit={saveHours} className="space-y-5">
          <section className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
              <Sun className="text-amber-600" size={22} />
              <p className="mt-4 text-xs font-black uppercase tracking-[0.16em] text-gray-500">
                {t("urmall.biz.settings.opens")}
              </p>
              <p className="mt-1 text-xl font-black text-gray-950">{formatTime(form.openTime)}</p>
            </div>
            <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
              <Moon className="text-indigo-600" size={22} />
              <p className="mt-4 text-xs font-black uppercase tracking-[0.16em] text-gray-500">
                {t("urmall.biz.settings.closes")}
              </p>
              <p className="mt-1 text-xl font-black text-gray-950">{formatTime(form.closeTime)}</p>
            </div>
            <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
              <CalendarDays className="text-emerald-700" size={22} />
              <p className="mt-4 text-xs font-black uppercase tracking-[0.16em] text-gray-500">
                {t("urmall.biz.settings.openDays")}
              </p>
              <p className="mt-1 text-xl font-black text-gray-950">{t("urmall.biz.settings.nDays", { count: form.operatingDays.length })}</p>
            </div>
          </section>

          <section className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gray-950 text-white">
                  <Clock3 size={19} />
                </span>
                <div>
                  <h2 className="text-lg font-black text-gray-950">{t("urmall.biz.settings.openingSchedule")}</h2>
                  <p className="mt-1 text-sm font-semibold text-gray-500">
                    {t("urmall.biz.settings.openingScheduleHint")}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={setWeekdays}
                  className="rounded-full border border-gray-200 px-3 py-2 text-xs font-black text-gray-700 transition hover:border-gray-950"
                >
                  {t("urmall.biz.settings.weekdays")}
                </button>
                <button
                  type="button"
                  onClick={setEveryday}
                  className="rounded-full border border-gray-200 px-3 py-2 text-xs font-black text-gray-700 transition hover:border-gray-950"
                >
                  {t("urmall.biz.settings.everyDay")}
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
                    <span className="block text-sm font-black">{t(day.labelKey)}</span>
                    <span className={`text-xs font-semibold ${selected ? "text-white/70" : "text-gray-500"}`}>
                      {selected ? t("urmall.biz.settings.open") : t("urmall.biz.settings.closed")}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <label>
                <span className={labelClass}>{t("urmall.biz.settings.openTime")}</span>
                <input
                  type="time"
                  className={inputClass}
                  value={form.openTime}
                  onChange={(event) => updateField("openTime", event.target.value)}
                />
              </label>
              <label>
                <span className={labelClass}>{t("urmall.biz.settings.closeTime")}</span>
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
            <h2 className="text-lg font-black text-gray-950">{t("urmall.biz.settings.serviceAvailability")}</h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <label className="flex items-center justify-between gap-3 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
                <span>
                  <span className="block text-sm font-black text-gray-950">{t("urmall.biz.settings.deliveryDuringHours")}</span>
                  <span className="text-xs font-semibold text-gray-500">{t("urmall.biz.settings.deliveryDuringHoursHint")}</span>
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
                  <span className="block text-sm font-black text-gray-950">{t("urmall.biz.settings.pickupDuringHours")}</span>
                  <span className="text-xs font-semibold text-gray-500">{t("urmall.biz.settings.pickupDuringHoursHint")}</span>
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
              {saving ? t("urmall.biz.saving") : t("urmall.biz.settings.saveHours")}
            </button>
          </div>
        </form>
        )}
      </div>
    </>
  );
}
