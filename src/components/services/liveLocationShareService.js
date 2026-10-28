import supabase from "../../Backend/lib/supabaseClient";
import { distanceInMeters } from "./operatorLocationPolicy.js";

// Live location sharing (Messages and UrRide trips) and "Track operator".
// Database: supabase/migrations/20261026120000_live_location_sharing.sql.
//
// Sharing: live_location_share_start picks who may watch (the conversation,
// or everyone on the trip) and an end time, at most 1 hour away. While the
// share runs and KunThai is open, this phone writes its position at most
// every PUBLISH_MIN_MS (sooner after a move of PUBLISH_MOVE_METERS), and
// stops by itself when the time is up. In the native app it keeps updating
// in the background or with the phone locked (liveShareBackground.js).
// Running shares survive a reload (localStorage) until they expire.
// Watching: the row itself (RLS: sharer or viewer), with realtime updates and
// a poll as a fallback.

export const LIVE_SHARE_DURATIONS = [15, 30, 60];
export const LIVE_SHARE_MAX_MINUTES = 60;
const PUBLISH_MIN_MS = 5000;
const PUBLISH_MOVE_METERS = 10;
const WATCH_POLL_MS = 10_000;
const TRACK_POLL_MS = 6000;
const STORAGE_KEY = "kunthai.liveLocationShares.v1";

export function minutesLeft(expiresAt, now = Date.now()) {
  const end = new Date(expiresAt).getTime();
  if (!Number.isFinite(end)) return 0;
  return Math.max(0, Math.ceil((end - now) / 60_000));
}

export function isShareLive(share, now = Date.now()) {
  if (!share || share.stopped_at || share.stoppedAt) return false;
  const end = new Date(share.expires_at || share.expiresAt).getTime();
  return Number.isFinite(end) && end > now;
}

export function mapShareRow(row) {
  if (!row) return null;
  const lat = Number(row.lat);
  const lng = Number(row.lng);
  return {
    id: row.id,
    sharerId: row.sharer_id,
    sharerName: row.sharer_name || "",
    context: row.context,
    conversationId: row.conversation_id || "",
    tripId: row.trip_id || "",
    lat: row.lat === null || row.lat === undefined || !Number.isFinite(lat) ? null : lat,
    lng: row.lng === null || row.lng === undefined || !Number.isFinite(lng) ? null : lng,
    accuracyM: Number.isFinite(Number(row.accuracy_m)) && row.accuracy_m !== null ? Number(row.accuracy_m) : null,
    heading: Number.isFinite(Number(row.heading)) && row.heading !== null ? Number(row.heading) : null,
    locatedAt: row.located_at || "",
    startedAt: row.started_at || "",
    expiresAt: row.expires_at || "",
    stoppedAt: row.stopped_at || "",
  };
}

// ---- Sharing (this phone) ---------------------------------------------------

const running = new Map();
const runningListeners = new Set();

function readStored() {
  try {
    const list = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    return Array.isArray(list) ? list.filter((share) => isShareLive(share)) : [];
  } catch {
    return [];
  }
}

function writeStored() {
  try {
    const list = [...running.values()].map(({ share }) => share);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {
    // The share still runs while KunThai stays open.
  }
}

function notifyRunning() {
  const list = readRunningShares();
  for (const listener of runningListeners) {
    try {
      listener(list);
    } catch {
      // A broken listener must not stop sharing.
    }
  }
}

export function readRunningShares() {
  return [...running.values()].map(({ share }) => share);
}

export function subscribeRunningShares(listener) {
  if (typeof listener !== "function") return () => {};
  runningListeners.add(listener);
  return () => runningListeners.delete(listener);
}

function publish(entry, position, { force = false } = {}) {
  const now = Date.now();
  const point = { lat: position.coords.latitude, lng: position.coords.longitude };
  if (!force && now - entry.lastAt < PUBLISH_MIN_MS && distanceInMeters(entry.lastPoint, point) < PUBLISH_MOVE_METERS) return;
  entry.lastAt = now;
  entry.lastPoint = point;
  supabase
    .rpc("live_location_share_update", {
      p_share_id: entry.share.id,
      p_lat: point.lat,
      p_lng: point.lng,
      p_accuracy_m: Number.isFinite(position.coords.accuracy) ? position.coords.accuracy : null,
      p_heading: Number.isFinite(position.coords.heading) ? position.coords.heading : null,
    })
    .then(({ data, error }) => {
      // false: stopped elsewhere or expired.
      if (!error && data === false) endLocal(entry.share.id);
    }, () => {});
}

// Background updates (native app): liveShareBackground.js runs the phone's
// background location watcher while any share is running.
function syncBackground({ interactive = false } = {}) {
  import("./liveShareBackground.js")
    .then(({ configureLiveShareBackground, refreshLiveShareBackground }) => {
      configureLiveShareBackground({
        hasRunningShares: () => running.size > 0,
        onLocation: (position, options) => {
          for (const entry of running.values()) publish(entry, position, options);
        },
      });
      return refreshLiveShareBackground({ interactive });
    })
    .catch(() => {});
}

function endLocal(shareId) {
  const entry = running.get(shareId);
  if (!entry) return;
  running.delete(shareId);
  if (entry.watchId !== null) navigator.geolocation?.clearWatch?.(entry.watchId);
  if (entry.timer) clearTimeout(entry.timer);
  writeStored();
  notifyRunning();
  syncBackground();
}

function runShare(share, { interactive = false } = {}) {
  if (!isShareLive(share) || running.has(share.id)) return;
  if (typeof navigator === "undefined" || !navigator.geolocation) return;
  const entry = { share, watchId: null, timer: null, lastAt: 0, lastPoint: null };
  running.set(share.id, entry);
  entry.watchId = navigator.geolocation.watchPosition(
    (position) => publish(entry, position),
    () => {},
    { enableHighAccuracy: true, maximumAge: 3000, timeout: 30_000 },
  );
  const left = new Date(share.expiresAt).getTime() - Date.now();
  entry.timer = setTimeout(() => endLocal(share.id), Math.max(0, left));
  writeStored();
  notifyRunning();
  syncBackground({ interactive });
}

// Starts sharing for `minutes` (capped at 1 hour). Resolves the share.
export async function startLiveShare({ context, conversationId = null, tripId = null, minutes = 15 }) {
  const { data, error } = await supabase.rpc("live_location_share_start", {
    p_context: context,
    p_conversation_id: conversationId || null,
    p_trip_id: tripId || null,
    p_minutes: Math.min(Math.max(Math.round(Number(minutes) || 15), 1), LIVE_SHARE_MAX_MINUTES),
  });
  if (error) throw error;
  const share = mapShareRow(Array.isArray(data) ? data[0] : data);
  if (!share?.id) throw new Error("Live location could not start.");
  // Any earlier share for the same place was replaced by the database.
  for (const entry of [...running.values()]) {
    const same = entry.share.context === share.context
      && entry.share.conversationId === share.conversationId
      && entry.share.tripId === share.tripId;
    if (same) endLocal(entry.share.id);
  }
  runShare(share, { interactive: true });
  // First position straight away.
  navigator.geolocation?.getCurrentPosition?.(
    (position) => {
      const entry = running.get(share.id);
      if (entry) publish(entry, position, { force: true });
    },
    () => {},
    { enableHighAccuracy: true, maximumAge: 5000, timeout: 15_000 },
  );
  return share;
}

export async function stopLiveShare(shareId) {
  endLocal(shareId);
  await supabase.rpc("live_location_share_stop", { p_share_id: shareId }).then(() => {}, () => {});
}

// Resumes this phone's running shares after a reload (called once at start).
let resumed = false;
export function resumeLiveShares() {
  if (resumed || typeof window === "undefined") return;
  resumed = true;
  for (const share of readStored()) runShare(share);
}

// ---- Watching ---------------------------------------------------------------

export async function fetchLiveShare(shareId) {
  const { data, error } = await supabase.from("live_location_shares").select("*").eq("id", shareId).maybeSingle();
  if (error) throw error;
  return mapShareRow(data);
}

// The other people's running shares on a trip (newest first).
export async function fetchTripLiveShares(tripId) {
  if (!tripId) return [];
  const { data: auth } = await supabase.auth.getUser();
  const me = auth?.user?.id || "";
  const { data, error } = await supabase
    .from("live_location_shares")
    .select("*")
    .eq("trip_id", tripId)
    .is("stopped_at", null)
    .gt("expires_at", new Date().toISOString())
    .order("started_at", { ascending: false });
  if (error) return [];
  return (data || []).map(mapShareRow).filter((share) => share.sharerId !== me);
}

// Calls onChange(share) on every change until the returned stop() is called.
export function watchLiveShare(shareId, onChange) {
  let stopped = false;
  const load = () => fetchLiveShare(shareId).then((share) => { if (!stopped) onChange(share); }, () => {});
  load();
  const channel = supabase
    .channel(`live-location-${shareId}-${Math.random().toString(36).slice(2, 8)}`)
    .on("postgres_changes", { event: "UPDATE", schema: "public", table: "live_location_shares", filter: `id=eq.${shareId}` }, (payload) => {
      if (!stopped && payload?.new) onChange(mapShareRow(payload.new));
    })
    .subscribe();
  const timer = setInterval(load, WATCH_POLL_MS);
  return () => {
    stopped = true;
    clearInterval(timer);
    supabase.removeChannel(channel).catch?.(() => {});
  };
}

// ---- Track operator -----------------------------------------------------------

export async function fetchOperatorTrack(fleetId, tripId = null) {
  const { data, error } = await supabase.rpc("transport_track_operator", { p_fleet_id: fleetId, p_trip_id: tripId || null });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return null;
  return {
    lat: Number(row.lat),
    lng: Number(row.lng),
    accuracyM: row.accuracy_m === null || row.accuracy_m === undefined ? null : Number(row.accuracy_m),
    heading: row.heading === null || row.heading === undefined ? null : Number(row.heading),
    locatedAt: row.last_seen_at || "",
    status: row.status || "",
    place: row.place || "",
    fleetType: row.fleet_type || "",
    fleetName: row.fleet_name || "",
  };
}

export function watchOperatorTrack(fleetId, tripId, onChange) {
  let stopped = false;
  const load = () => fetchOperatorTrack(fleetId, tripId).then(
    (track) => { if (!stopped) onChange(track); },
    () => { if (!stopped) onChange(null); },
  );
  load();
  const timer = setInterval(load, TRACK_POLL_MS);
  return () => {
    stopped = true;
    clearInterval(timer);
  };
}

// A share still running from before a reload keeps publishing.
if (typeof window !== "undefined") window.setTimeout(resumeLiveShares, 2500);
