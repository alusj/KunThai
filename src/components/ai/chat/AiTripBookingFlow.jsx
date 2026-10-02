import { lazy, Suspense, useState } from "react";
import { motion } from "framer-motion";
import { BadgeCheck, CalendarClock, Car, ClipboardCheck, Crosshair, MapPin, X } from "lucide-react";

import {
  cancelTripBooking,
  cancelTripPicker,
  chooseTripOption,
  submitTripDateTime,
  submitTripPickedLocation,
  tripText,
  useTripBookingFlow,
} from "../../../Backend/services/ai/tripBookingFlow";
import { uiText as translateUi, useI18n as useUiLocale } from "../../../i18n/index.js";

// KAI — the guided UrRide booking, shown inside the chat. KAI's questions and
// the person's answers read like the rest of the conversation; options are
// buttons, and free answers are typed in the normal chat box.

const AiTripPinPicker = lazy(() => import("./AiTripPinPicker"));

function localDateTimeValue(date) {
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function OperatorCard({ fleet }) {
  useUiLocale();
  const online = fleet.activeStatus === "active";
  return (
    <div className="mt-2 flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-2.5">
      <span className="grid h-10 w-10 flex-none place-items-center rounded-xl bg-emerald-50 text-emerald-700">
        <Car size={18} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1 truncate text-sm font-black text-slate-900">
          {fleet.operatorName || fleet.fleetName}
          {["verified", "recommended"].includes(fleet.verificationStatus) ? <BadgeCheck size={13} className="flex-none text-sky-600" /> : null}
        </span>
        <span className="block truncate text-[11px] font-semibold text-slate-500">
          {[fleet.operatorId, translateUi(fleet.displayType || fleet.fleetType || ""), fleet.plateNumber].filter(Boolean).join(" · ")}
        </span>
      </span>
      <span className={`flex-none rounded-full px-2 py-0.5 text-[10px] font-black uppercase ${online ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-600"}`}>
        {online ? "●" : "○"}
      </span>
    </div>
  );
}

// The address a GPS fix or map pin resolved to, shown back for confirmation.
function LocationCard({ point }) {
  useUiLocale();
  const lat = Number(point?.lat);
  const lng = Number(point?.lng);
  const hasCoordinates = Number.isFinite(lat) && Number.isFinite(lng);
  const accuracy = Number(point?.accuracy);
  return (
    <div className="mt-2 flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50/60 p-3">
      <span className="grid h-10 w-10 flex-none place-items-center rounded-xl bg-white text-emerald-700 shadow-sm">
        <MapPin size={18} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[11px] font-black uppercase tracking-[0.12em] text-emerald-700">{point?.name || tripText("rowPickup")}</span>
        <span className="mt-0.5 block break-words text-sm font-black leading-5 text-slate-900">{point?.address || "—"}</span>
        {hasCoordinates ? (
          <span className="mt-1 flex items-center gap-1 text-[11px] font-semibold text-slate-500">
            <Crosshair size={11} />
            {lat.toFixed(5)}, {lng.toFixed(5)}
            {Number.isFinite(accuracy) && accuracy > 0 ? ` · ±${Math.round(accuracy)} m` : ""}
          </span>
        ) : null}
      </span>
    </div>
  );
}

function SummaryCard({ rows }) {
  useUiLocale();
  return (
    <div className="mt-2 rounded-2xl border border-emerald-200 bg-emerald-50/60 p-3">
      <p className="flex items-center gap-1.5 text-xs font-black uppercase tracking-[0.12em] text-emerald-700">
        <ClipboardCheck size={13} /> {tripText("summaryTitle")}
      </p>
      <dl className="mt-2 space-y-1.5">
        {rows.map(([label, value]) => (
          <div key={label} className="grid grid-cols-[6.5rem_1fr] gap-2 text-xs">
            <dt className="font-bold text-slate-500">{label}</dt>
            <dd className="min-w-0 break-words font-black text-slate-900">{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function DateTimeQuestion() {
  useUiLocale();
  const [value, setValue] = useState(() => localDateTimeValue(new Date(Date.now() + 60 * 60 * 1000)));
  return (
    <div className="mt-2 flex flex-wrap items-center gap-2">
      <input
        type="datetime-local"
        value={value}
        min={localDateTimeValue(new Date())}
        onChange={(event) => setValue(event.target.value)}
        className="h-10 min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-800 outline-none focus:border-sky-400"
      />
      <button
        type="button"
        onClick={() => submitTripDateTime(value)}
        className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-emerald-600 px-3 text-xs font-black text-white"
      >
        <CalendarClock size={14} /> {tripText("confirmTime")}
      </button>
    </div>
  );
}

export default function AiTripBookingFlow() {
  useUiLocale();
  const flow = useTripBookingFlow();
  if (!flow.transcript.length) return null;
  const question = flow.active ? flow.question : null;

  return (
    <div className="space-y-3" data-kai-trip-flow>
      {flow.transcript.map((entry) =>
        entry.from === "user" ? (
          <div key={entry.id} className="flex justify-end">
            <p className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-slate-900 px-3.5 py-2 text-sm leading-relaxed text-white">{entry.text}</p>
          </div>
        ) : (
          <div key={entry.id} className="max-w-[94%]">
            <div className="rounded-2xl rounded-bl-md border border-slate-200 bg-white px-3.5 py-3">
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-800">{entry.text}</p>
              {entry.card?.type === "operator" ? <OperatorCard fleet={entry.card.fleet} /> : null}
              {entry.card?.type === "summary" ? <SummaryCard rows={entry.card.rows} /> : null}
              {entry.card?.type === "location" ? <LocationCard point={entry.card.point} /> : null}
            </div>
          </div>
        ),
      )}

      {flow.active && flow.busy ? (
        <div className="flex items-center gap-2 rounded-2xl rounded-bl-md border border-slate-200 bg-white px-3.5 py-3 text-xs font-bold text-slate-500">
          <motion.span className="h-2 w-2 rounded-full bg-emerald-500" animate={{ opacity: [0.3, 1, 0.3] }} transition={{ duration: 1, repeat: Infinity }} />
          {flow.busy}
        </div>
      ) : null}

      {question && !flow.busy ? (
        <div className="space-y-2 pl-1">
          {question.options.length ? (
            <div className="flex flex-wrap gap-1.5">
              {question.options.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => chooseTripOption(option.value)}
                  className={`max-w-full rounded-2xl border px-3 py-2 text-left text-xs font-black transition ${
                    option.primary || ["review", "open", "operator"].includes(option.value)
                      ? "border-emerald-600 bg-emerald-600 text-white hover:bg-emerald-700"
                      : "border-slate-200 bg-white text-slate-700 hover:border-emerald-300 hover:bg-emerald-50"
                  }`}
                >
                  <span className="block">{option.label}</span>
                  {option.hint ? <span className="mt-0.5 block text-[10px] font-semibold opacity-80">{option.hint}</span> : null}
                </button>
              ))}
            </div>
          ) : null}
          {question.input?.type === "datetime" ? <DateTimeQuestion /> : null}
          <button
            type="button"
            onClick={() => cancelTripBooking()}
            className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-black text-slate-500"
          >
            <X size={11} /> {tripText("cancel")}
          </button>
        </div>
      ) : null}

      {flow.active && flow.picker ? (
        <Suspense fallback={null}>
          <AiTripPinPicker
            picker={flow.picker}
            mode={flow.data.mode === "delivery" ? "delivery" : "ride"}
            onPicked={submitTripPickedLocation}
            onClose={cancelTripPicker}
          />
        </Suspense>
      ) : null}
    </div>
  );
}
