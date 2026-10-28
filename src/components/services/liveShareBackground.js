import supabase, { SUPABASE_API } from "../../Backend/lib/supabaseClient";
import { t } from "../../i18n";
import { createNativeLocationSession } from "./operatorNativeLocationSession.js";
import {
  backgroundLocationPlatform,
  isOperatorNativeWatchRunning,
  loadBackgroundLocationPlugin,
  subscribeOperatorPublishStatus,
} from "./operatorLiveLocationService";

// Live location shares keep updating with KunThai in the background or the
// phone locked, until their time is up (supabase/migrations/
// 20261027140000_live_location_share_background.sql).
//
// The phone has one background location watcher. While an operator is online
// it belongs to operatorLiveLocationService, whose native pings also move
// this person's shares on the server, so nothing more is needed here. Any
// other time a share is running, this module runs the watcher itself and its
// native code POSTs every fix to live_location_share_native_ping. It hands the
// watcher back (without stopping it) when the operator goes online, and takes
// it again when they go offline with a share still running.

let config = { hasRunningShares: () => false, onLocation: () => {} };
let own = null; // { session }
let lastFixAt = 0;
let lastPosition = null;
let refreshing = Promise.resolve();
let operatorUnsubscribe = null;

const TOKEN_WAIT_MS = 6000;

async function prepareShareDelivery() {
  let timer;
  const timeout = new Promise((resolve) => {
    timer = setTimeout(() => resolve({ data: null }), TOKEN_WAIT_MS);
  });
  const { data: token, error } = await Promise.race([supabase.rpc("live_location_share_native_start"), timeout])
    .finally(() => clearTimeout(timer));
  if (error || typeof token !== "string" || !token) return null;
  return {
    url: `${SUPABASE_API.url.replace(/\/+$/, "")}/rest/v1/rpc/live_location_share_native_ping`,
    headers: {
      apikey: SUPABASE_API.anonKey,
      Authorization: `Bearer ${SUPABASE_API.anonKey}`,
      "x-kunthai-share-token": token,
    },
  };
}

function stopOwn() {
  if (!own) return;
  const { session } = own;
  own = null;
  session.stop();
  supabase.rpc("live_location_share_native_stop").then(() => {}, () => {});
}

// The operator's watcher replaced ours: keep it running, drop our handle.
function handOver() {
  if (!own) return;
  own.session.stopHeartbeat();
  own = null;
}

async function reconcile({ interactive = false } = {}) {
  if (!config.hasRunningShares()) {
    stopOwn();
    return;
  }
  if (isOperatorNativeWatchRunning()) {
    handOver();
    return;
  }
  if (own) return;
  const { plugin } = await loadBackgroundLocationPlugin();
  if (!plugin || own || !config.hasRunningShares() || isOperatorNativeWatchRunning()) return;
  const session = createNativeLocationSession({
    plugin,
    platform: backgroundLocationPlatform(),
    interactive,
    notificationTitle: t("liveSharing.backgroundTitle"),
    notificationMessage: t("liveSharing.backgroundMessage"),
    onLocation: (position) => {
      lastFixAt = Date.now();
      lastPosition = position;
      config.onLocation(position);
    },
    prepareDelivery: prepareShareDelivery,
    lastPublishedAt: () => lastFixAt,
    hasPoint: () => Boolean(lastPosition),
    beat: () => {
      if (!lastPosition) return;
      lastFixAt = Date.now();
      config.onLocation(lastPosition, { force: true });
    },
  });
  own = { session };
}

// Called by liveLocationShareService whenever its running shares change;
// `interactive` only right after the person tapped Share (the system may then
// ask for background location).
export function refreshLiveShareBackground({ interactive = false } = {}) {
  if (!operatorUnsubscribe) {
    operatorUnsubscribe = subscribeOperatorPublishStatus(() => {
      refreshing = refreshing.then(() => reconcile(), () => reconcile());
    });
  }
  refreshing = refreshing.then(() => reconcile({ interactive }), () => reconcile({ interactive }));
  return refreshing;
}

export function configureLiveShareBackground(next) {
  config = { ...config, ...next };
}
