import { useEffect, useState } from "react";
import { FiEye, FiNavigation, FiRadio, FiStopCircle } from "react-icons/fi";

import { useI18n, t } from "../../../i18n";
import {
  fetchTripLiveShares,
  readRunningShares,
  startLiveShare,
  stopLiveShare,
  subscribeRunningShares,
} from "../../services/liveLocationShareService";
import LiveLocationViewer from "../../shared/liveLocation/LiveLocationViewer";
import LiveShareDurationSheet from "../../shared/liveLocation/LiveShareDurationSheet";

// A booking the operator accepted, until it ends: ride or delivery.
const LIVE_TRIP_STATUSES = ["accepted", "arrived", "start_requested", "in_progress", "paused"];
const OTHER_SHARES_POLL_MS = 20_000;

function clock(value) {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "";
}

// On a trip card, for the passenger (role "passenger") and the operator
// ("operator"):
//   Track operator            passenger only: where the operator is now and
//                             how far away (ride and delivery)
//   Share live location       for 15 min to 1 hour, to everyone on the trip
//   See <name>'s live location when someone else on the trip is sharing
export default function TripLiveLocationControls({ trip, role = "passenger", className = "" }) {
  useI18n();
  const live = LIVE_TRIP_STATUSES.includes(trip?.rawStatus || trip?.status);
  const tripId = trip?.id || "";
  const fleetId = trip?.fleetId || trip?.fleet?.id || "";
  const operatorName = trip?.fleet?.fleetName || trip?.fleet?.operatorName || t("liveSharing.operator");
  const [sheetOpen, setSheetOpen] = useState(false);
  const [viewer, setViewer] = useState(null);
  const [mine, setMine] = useState(() => readRunningShares().find((share) => share.tripId === tripId) || null);
  const [others, setOthers] = useState([]);

  useEffect(() => subscribeRunningShares((list) => setMine(list.find((share) => share.tripId === tripId) || null)), [tripId]);

  useEffect(() => {
    if (!live || !tripId) return undefined;
    let alive = true;
    const load = () => fetchTripLiveShares(tripId).then((list) => { if (alive) setOthers(list); }, () => {});
    load();
    const timer = setInterval(load, OTHER_SHARES_POLL_MS);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [live, tripId]);

  if (!live || !tripId) return null;

  return (
    <div className={`grid gap-2 ${className}`} data-direction="trip-live-location">
      {role === "passenger" && fleetId ? (
        <button
          type="button"
          onClick={() => setViewer({ title: t("liveSharing.trackingName", { name: operatorName }), source: { kind: "operator", fleetId, tripId }, fleetType: trip?.fleet?.fleetType || "" })}
          className="kt-touchable flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-sky-600 px-4 text-sm font-black text-white"
        >
          <FiNavigation size={17} />
          {t("liveSharing.trackOperator")}
        </button>
      ) : null}

      {others.map((share) => (
        <button
          key={share.id}
          type="button"
          onClick={() => setViewer({ title: t("liveSharing.nameLiveLocation", { name: share.sharerName || t("liveSharing.someone") }), source: { kind: "share", shareId: share.id } })}
          className="kt-touchable flex h-12 w-full items-center justify-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 text-sm font-black text-emerald-800"
        >
          <FiEye size={17} />
          {t("liveSharing.seeNameLive", { name: share.sharerName || t("liveSharing.someone") })}
        </button>
      ))}

      {mine ? (
        <div className="grid grid-cols-[1fr_auto_auto] items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 p-2 pl-3">
          <p className="min-w-0 text-xs font-black text-emerald-800">
            <FiRadio className="mr-1 inline animate-pulse" />
            {t("liveSharing.sharingUntil", { time: clock(mine.expiresAt) })}
          </p>
          <button type="button" onClick={() => setViewer({ title: t("liveSharing.yourLiveLocation"), source: { kind: "share", shareId: mine.id }, isMine: true })} className="h-9 rounded-xl bg-white px-3 text-xs font-black text-emerald-800">
            {t("liveSharing.view")}
          </button>
          <button type="button" onClick={() => stopLiveShare(mine.id)} aria-label={t("liveSharing.stopSharing")} className="flex h-9 items-center gap-1 rounded-xl bg-white px-3 text-xs font-black text-rose-700">
            <FiStopCircle size={14} />
            {t("liveSharing.stop")}
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setSheetOpen(true)}
          className="kt-touchable flex h-12 w-full items-center justify-center gap-2 rounded-2xl border border-emerald-200 bg-white px-4 text-sm font-black text-emerald-700"
        >
          <FiRadio size={17} />
          {t("liveSharing.shareLive")}
        </button>
      )}

      <LiveShareDurationSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        body={role === "operator" ? t("liveSharing.tripDurationBodyOperator") : t("liveSharing.tripDurationBodyPassenger")}
        onStart={(minutes) => startLiveShare({ context: "trip", tripId, minutes })}
      />
      <LiveLocationViewer
        open={Boolean(viewer)}
        onClose={() => setViewer(null)}
        title={viewer?.title || ""}
        source={viewer?.source}
        isMine={Boolean(viewer?.isMine)}
        fleetType={viewer?.fleetType || trip?.fleet?.fleetType || ""}
      />
    </div>
  );
}
