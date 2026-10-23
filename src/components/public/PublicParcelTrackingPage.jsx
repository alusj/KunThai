import { useCallback, useEffect, useState } from "react";
import { FiCheckCircle, FiClock, FiMapPin, FiNavigation, FiPackage, FiTruck } from "react-icons/fi";

import { fetchPublicParcelTracking, mapsUrlFor } from "../services/parcelHandoverService";
import { useI18n, t } from "../../i18n";

// Public, sign-in-free page for a parcel's receiver: /track/<token> from the
// link the sender sends. It shows where the rider is while the parcel is on
// its way and the drop-off code the receiver gives the rider. Server side:
// transport_public_parcel_tracking (20261022140000_urride_parcel_handover.sql).

const POLL_MS = 20_000;

function minutesAgo(timestamp) {
  const time = timestamp ? new Date(timestamp).getTime() : NaN;
  if (!Number.isFinite(time)) return "";
  const minutes = Math.floor(Math.max(0, Date.now() - time) / 60000);
  return minutes < 1 ? t("urrideParcel.justNow") : t("urrideParcel.minutesAgo", { count: minutes });
}

function headline(status) {
  if (status === "completed") return t("urrideParcel.parcelDelivered");
  if (status === "cancelled") return t("urrideParcel.publicCancelled");
  if (["in_progress", "paused"].includes(status)) return t("urrideParcel.publicOnWay");
  return t("urrideParcel.publicPickup");
}

export default function PublicParcelTrackingPage({ token }) {
  useI18n();
  const [parcel, setParcel] = useState(null);
  const [state, setState] = useState("loading");

  const load = useCallback(async () => {
    try {
      const next = await fetchPublicParcelTracking(token);
      setParcel(next);
      setState(next ? "ready" : "missing");
    } catch {
      setState((current) => (current === "ready" ? current : "missing"));
    }
  }, [token]);

  useEffect(() => {
    load();
    const timer = window.setInterval(load, POLL_MS);
    return () => window.clearInterval(timer);
  }, [load]);

  const done = ["completed", "cancelled"].includes(parcel?.status);
  const mapsUrl = done ? "" : mapsUrlFor(parcel?.riderLat, parcel?.riderLng);
  const lastSeen = done ? "" : minutesAgo(parcel?.riderLocatedAt);

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-6 text-slate-900" data-testid="public-parcel-tracking">
      <div className="mx-auto w-full max-w-md">
        <p className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.18em] text-emerald-700">
          <FiPackage size={14} />
          KunThai · {t("urrideParcel.publicTitle")}
        </p>

        {state === "loading" ? (
          <div className="mt-6 h-40 animate-pulse rounded-3xl bg-white" aria-busy="true" />
        ) : state === "missing" ? (
          <section className="mt-6 rounded-3xl border border-slate-200 bg-white p-5 text-sm font-bold text-slate-600">
            {t("urrideParcel.publicNotFound")}
          </section>
        ) : (
          <>
            <section className="mt-4 rounded-3xl border border-emerald-100 bg-white p-5 shadow-sm">
              <h1 className="flex items-center gap-2 text-xl font-black text-slate-950">
                {parcel.status === "completed" ? <FiCheckCircle className="text-emerald-600" /> : <FiTruck className="text-emerald-600" />}
                {headline(parcel.status)}
              </h1>
              {parcel.title ? <p className="mt-1 text-sm font-semibold text-slate-500">{parcel.title}</p> : null}
              <div className="mt-4 grid gap-2 text-sm">
                <p className="flex items-start gap-2"><FiMapPin className="mt-0.5 shrink-0 text-slate-400" /><span><span className="font-black">{t("urrideParcel.from")}:</span> {parcel.pickupLabel}</span></p>
                <p className="flex items-start gap-2"><FiNavigation className="mt-0.5 shrink-0 text-slate-400" /><span><span className="font-black">{t("urrideParcel.to")}:</span> {parcel.destinationLabel}</span></p>
                {parcel.riderName ? (
                  <p className="flex items-start gap-2"><FiTruck className="mt-0.5 shrink-0 text-slate-400" /><span><span className="font-black">{t("urrideParcel.rider")}:</span> {[parcel.riderName, parcel.fleetType, parcel.plateNumber].filter(Boolean).join(" · ")}</span></p>
                ) : null}
              </div>
            </section>

            {!done && parcel.dropoffCode ? (
              <section className="mt-4 rounded-3xl border border-dashed border-emerald-300 bg-white p-5 text-center">
                <p className="text-[11px] font-black uppercase tracking-[0.16em] text-emerald-700">{t("urrideParcel.dropoffCode")}</p>
                <p className="mt-1 text-4xl font-black tracking-[0.4em] text-slate-950">{parcel.dropoffCode}</p>
                <p className="mt-2 text-xs font-semibold leading-5 text-slate-600">{t("urrideParcel.publicCodeHint")}</p>
              </section>
            ) : null}

            {!done ? (
              <section className="mt-4 rounded-3xl border border-slate-200 bg-white p-5">
                <p className="flex items-center gap-2 text-xs font-bold text-slate-500">
                  <FiClock size={14} />
                  {lastSeen ? t("urrideParcel.lastSeen", { time: lastSeen }) : t("urrideParcel.noLocationYet")}
                </p>
                {mapsUrl ? (
                  <a href={mapsUrl} target="_blank" rel="noreferrer" className="mt-3 flex h-12 items-center justify-center gap-2 rounded-2xl bg-emerald-600 text-sm font-black text-white">
                    <FiMapPin size={17} />
                    {t("urrideParcel.openMaps")}
                  </a>
                ) : null}
                <p className="mt-3 text-[11px] font-semibold text-slate-400">{t("urrideParcel.autoRefresh")}</p>
              </section>
            ) : null}
          </>
        )}
      </div>
    </main>
  );
}
