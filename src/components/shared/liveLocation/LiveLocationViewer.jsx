import { useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { FiCrosshair, FiNavigation, FiStopCircle, FiX } from "react-icons/fi";

import AppPortal from "../AppPortal";
import { useI18n, t } from "../../../i18n";
import { distanceInMeters } from "../../services/operatorLocationPolicy";
import { estimateTravelMinutes } from "../../services/topRatedNearby";
import { isShareLive, stopLiveShare, watchLiveShare, watchOperatorTrack } from "../../services/liveLocationShareService";

const MAPTILER_KEY = import.meta.env.VITE_MAPTILER_KEY;
const MAP_STYLE = MAPTILER_KEY
  ? `https://api.maptiler.com/maps/${import.meta.env.VITE_MAPTILER_STYLE_ID || "streets-v2"}/style.json?key=${MAPTILER_KEY}`
  : {
      version: 8,
      sources: {
        osm: { type: "raster", tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"], tileSize: 256, attribution: "© OpenStreetMap contributors" },
      },
      layers: [{ id: "osm", type: "raster", source: "osm", minzoom: 0, maxzoom: 19 }],
    };

function clock(value) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function secondsAgo(value, now) {
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? Math.max(0, Math.round((now - time) / 1000)) : null;
}

function agoText(seconds) {
  if (seconds === null) return "";
  if (seconds < 60) return t("liveSharing.updatedSeconds", { seconds });
  return t("liveSharing.updatedMinutes", { minutes: Math.round(seconds / 60) });
}

function distanceText(metres) {
  if (!Number.isFinite(metres)) return "";
  return metres < 1000
    ? t("liveSharing.distanceMeters", { value: Math.max(10, Math.round(metres / 10) * 10) })
    : t("liveSharing.distanceKilometres", { value: (Math.round(metres / 100) / 10).toFixed(1) });
}

function markerElement(className) {
  const element = document.createElement("div");
  element.className = className;
  return element;
}

// Full-screen live map of one moving person: a shared live location
// (`source.kind === "share"`) or an operator (`"operator"`, Track operator).
// Follows the position as it changes, shows how far it is from this phone and
// how fresh it is, and, for the sharer, a Stop sharing button.
export default function LiveLocationViewer({ open, onClose, title = "", source, isMine = false, fleetType = "" }) {
  useI18n();
  const mapNode = useRef(null);
  const mapRef = useRef(null);
  const targetMarker = useRef(null);
  const meMarker = useRef(null);
  const followRef = useRef(true);
  const [target, setTarget] = useState(null);
  const [share, setShare] = useState(null);
  const [me, setMe] = useState(null);
  const [now, setNow] = useState(() => Date.now());
  const [loaded, setLoaded] = useState(false);
  const sourceKey = source ? `${source.kind}:${source.shareId || source.fleetId}:${source.tripId || ""}` : "";

  // The position being watched.
  useEffect(() => {
    if (!open || !source) return undefined;
    setLoaded(false);
    setTarget(null);
    setShare(null);
    followRef.current = true;
    if (source.kind === "share") {
      return watchLiveShare(source.shareId, (next) => {
        setLoaded(true);
        setShare(next);
        setTarget(next && next.lat !== null && next.lng !== null && isShareLive(next)
          ? { lat: next.lat, lng: next.lng, accuracyM: next.accuracyM, locatedAt: next.locatedAt }
          : null);
      });
    }
    return watchOperatorTrack(source.fleetId, source.tripId, (track) => {
      setLoaded(true);
      setTarget(track && Number.isFinite(track.lat) && Number.isFinite(track.lng) ? track : null);
    });
    // sourceKey stands for `source`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, sourceKey]);

  // This phone's own position, for the distance.
  useEffect(() => {
    if (!open || typeof navigator === "undefined" || !navigator.geolocation) return undefined;
    const id = navigator.geolocation.watchPosition(
      (position) => setMe({ lat: position.coords.latitude, lng: position.coords.longitude }),
      () => {},
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 30_000 },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [open]);

  // The map.
  useEffect(() => {
    if (!open || !mapNode.current) return undefined;
    const map = new maplibregl.Map({
      container: mapNode.current,
      style: MAP_STYLE,
      center: [-13.2317, 8.4657],
      zoom: 13,
      attributionControl: false,
    });
    map.on("dragstart", () => {
      followRef.current = false;
    });
    mapRef.current = map;
    return () => {
      targetMarker.current = null;
      meMarker.current = null;
      mapRef.current = null;
      map.remove();
    };
  }, [open]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !target) return;
    const lngLat = [target.lng, target.lat];
    if (!targetMarker.current) {
      targetMarker.current = new maplibregl.Marker({ element: markerElement("kt-live-target") }).setLngLat(lngLat).addTo(map);
      map.jumpTo({ center: lngLat, zoom: 15 });
    } else {
      targetMarker.current.setLngLat(lngLat);
      if (followRef.current) map.easeTo({ center: lngLat, duration: 800 });
    }
  }, [target]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !me) return;
    if (!meMarker.current) meMarker.current = new maplibregl.Marker({ element: markerElement("kt-live-me") }).setLngLat([me.lng, me.lat]).addTo(map);
    else meMarker.current.setLngLat([me.lng, me.lat]);
  }, [me]);

  if (!open || !source) return null;

  const ended = source.kind === "share" && share && !isShareLive(share, now);
  const metres = target && me ? distanceInMeters(me, target) : NaN;
  const eta = Number.isFinite(metres) ? estimateTravelMinutes(metres / 1000, fleetType) : null;
  const approximate = Number(target?.accuracyM) > 100;
  const status = source.kind === "share"
    ? ended
      ? t("liveSharing.ended")
      : share?.expiresAt
        ? t("liveSharing.liveUntil", { time: clock(share.expiresAt) })
        : ""
    : target
      ? t("liveSharing.operatorOnline")
      : loaded
        ? t("liveSharing.operatorNotSharing")
        : "";

  function recenter() {
    followRef.current = true;
    if (target && mapRef.current) mapRef.current.easeTo({ center: [target.lng, target.lat], zoom: 16, duration: 600 });
  }

  function openRoute() {
    if (!target) return;
    onClose?.();
    window.dispatchEvent(new CustomEvent("kuntai-open-area-view", {
      detail: {
        autoRoute: true,
        destination: { id: `live-${sourceKey}`, type: "live-location", name: title, label: title, address: target.place || title, lat: target.lat, lng: target.lng },
        source: "live-location",
      },
    }));
  }

  return (
    <AppPortal>
      <div className="fixed inset-0 z-[80] flex flex-col bg-slate-950" role="dialog" aria-modal="true" aria-label={title} data-direction="live-location-viewer">
        <style>{`
          .kt-live-target { width: 22px; height: 22px; border-radius: 9999px; background: #10b981; border: 3px solid #fff; box-shadow: 0 0 0 0 rgba(16,185,129,.6); animation: kt-live-pulse 1.8s infinite; }
          .kt-live-me { width: 16px; height: 16px; border-radius: 9999px; background: #2563eb; border: 3px solid #fff; box-shadow: 0 1px 6px rgba(0,0,0,.35); }
          @keyframes kt-live-pulse { 0% { box-shadow: 0 0 0 0 rgba(16,185,129,.55); } 70% { box-shadow: 0 0 0 18px rgba(16,185,129,0); } 100% { box-shadow: 0 0 0 0 rgba(16,185,129,0); } }
        `}</style>
        <header className="flex items-center gap-3 bg-white px-3 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] shadow-sm">
          <button type="button" onClick={onClose} aria-label={t("liveSharing.close")} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-700">
            <FiX size={18} />
          </button>
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-base font-black text-slate-950">{title}</h2>
            <p className={`truncate text-xs font-bold ${ended || (loaded && !target) ? "text-slate-500" : "text-emerald-700"}`}>
              {[status, target && !ended ? agoText(secondsAgo(target.locatedAt, now)) : ""].filter(Boolean).join(" · ")}
            </p>
          </div>
        </header>
        <div className="relative flex-1">
          <div ref={mapNode} className="absolute inset-0" />
          {target ? (
            <button type="button" onClick={recenter} aria-label={t("liveSharing.recenter")} className="absolute right-3 top-3 flex h-11 w-11 items-center justify-center rounded-full bg-white text-slate-800 shadow-lg">
              <FiCrosshair size={18} />
            </button>
          ) : null}
          {!target ? (
            <div className="absolute inset-x-4 top-4 rounded-2xl bg-white/95 p-4 text-center text-sm font-bold text-slate-700 shadow-lg">
              {!loaded ? t("liveSharing.loading") : ended ? t("liveSharing.endedBody") : source.kind === "share" ? t("liveSharing.waitingForPosition") : t("liveSharing.operatorNotSharingBody")}
            </div>
          ) : null}
        </div>
        <footer className="grid gap-2 bg-white px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
          {target ? (
            <p className="text-sm font-black text-slate-900">
              {Number.isFinite(metres) ? t("liveSharing.awayFromYou", { distance: distanceText(metres), eta: eta || 1 }) : t("liveSharing.locatingYou")}
              {approximate ? <span className="block text-xs font-bold text-amber-700">{t("liveSharing.approximate", { m: Math.round(target.accuracyM) })}</span> : null}
              {target.place ? <span className="block truncate text-xs font-semibold text-slate-500">{target.place}</span> : null}
            </p>
          ) : null}
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={openRoute} disabled={!target} className="flex h-11 items-center justify-center gap-2 rounded-2xl bg-slate-950 text-sm font-black text-white disabled:bg-slate-300">
              <FiNavigation size={16} />
              {t("liveSharing.route")}
            </button>
            {isMine && source.kind === "share" && !ended ? (
              <button
                type="button"
                onClick={() => {
                  stopLiveShare(source.shareId);
                  onClose?.();
                }}
                className="flex h-11 items-center justify-center gap-2 rounded-2xl border border-rose-200 bg-rose-50 text-sm font-black text-rose-700"
              >
                <FiStopCircle size={16} />
                {t("liveSharing.stopSharing")}
              </button>
            ) : (
              <button type="button" onClick={onClose} className="h-11 rounded-2xl border border-slate-200 bg-white text-sm font-black text-slate-700">
                {t("liveSharing.close")}
              </button>
            )}
          </div>
        </footer>
      </div>
    </AppPortal>
  );
}
