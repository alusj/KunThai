import { useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { FiChevronDown, FiChevronUp } from "react-icons/fi";
import {
  formatDistance,
  formatDuration,
  getRouteBetweenPoints,
  getRouteThroughPoints,
} from "../../../Backend/services/routeService";
import { showToast } from "../../../Backend/services/toastService";
import { getNetworkStatus, subscribeToNetworkStatus } from "../../../Backend/services/networkService";
import { getActiveCountryProfile } from "../../../data/globalCountryProfiles";
import { useI18n, t } from "../../../i18n";
import { t as i18nText } from "../../../i18n/index";

const ROUTE_STATUS_LABEL_KEYS = {
  correct: "urride.areaMap.rsCorrectLabel",
  warning: "urride.areaMap.rsWarningLabel",
  wrong: "urride.areaMap.rsWrongLabel",
};

const ROUTE_STATUS_MSG_KEYS = {
  correct: "urride.areaMap.rsCorrectMsg",
  warning: "urride.areaMap.rsWarningMsg",
  wrong: "urride.areaMap.rsWrongMsg",
};

const ROUTE_STATUS_PILL_KEYS = {
  correct: "urride.areaMap.pillCorrect",
  warning: "urride.areaMap.pillWarning",
  wrong: "urride.areaMap.pillWrong",
};

const defaultCountryProfile = getActiveCountryProfile();
const DEFAULT_CENTER = defaultCountryProfile.mapCenter;

const ROUTE_STATUS = {
  correct: {
    color: "#16a34a",
    className: "bg-green-100 text-green-700",
  },
  warning: {
    color: "#eab308",
    className: "bg-yellow-100 text-yellow-700",
  },
  wrong: {
    color: "#dc2626",
    className: "bg-red-100 text-red-700",
  },
};

const GPS_SETTINGS = {
  animationMs: 850,
  ignoreAccuracyAboveMeters: 140,
  lowAccuracyWarningMeters: 75,
  correctRouteMeters: 45,
  warningRouteMeters: 120,
  rerouteRouteMeters: 165,
  arrivalMeters: 34,
  rerouteCooldownMs: 7000,
  rerouteConfirmMs: 850,
  cameraThrottleMs: 1200,
  progressBacktrackSegments: 4,
  ignoreTinyMoveMeters: 4.5,
  jumpDistanceMeters: 90,
  maxHumanSpeedMetersPerSecond: 22,
  parentPublishMeters: 35,
  parentPublishMaxMs: 7000,
  gpsUiThrottleMs: 1800,
  gpsUiAccuracyDeltaMeters: 8,
  headingUiThrottleMs: 700,
  headingUiDeltaDegrees: 6,
};

const TRAFFIC_AHEAD_SETTINGS = {
  checkThrottleMs: 12000,
  routeDistanceMeters: 150,
  minUserDistanceMeters: 35,
  affectedSegmentsBefore: 2,
  affectedSegmentsAfter: 8,
};

// Live ETA/distance tuning. The route ETA is not shown from the routing
// engine's static guess; it only appears once the traveller actually starts
// moving, then it (and the remaining distance) count down from live GPS.
const NAV_MOVEMENT_SETTINGS = {
  // ~2.2 km/h. Above this we treat the traveller as genuinely moving rather
  // than GPS drift, which is what unlocks the ETA.
  movingSpeedMps: 0.6,
  // Speed floor used only for the ETA division so a brief slow crawl can't
  // balloon the ETA to an unrealistic number.
  minEtaSpeedMps: 0.9,
  // Exponential smoothing weight for the live speed estimate.
  speedSmoothing: 0.4,
  // Throttle how often the live distance/ETA text is rewritten.
  progressUiThrottleMs: 1400,
  etaPlaceholder: "Move to start ETA",
};

// Route-snapping keeps the moving icon riding the drawn route line instead of
// jittering beside it. When the traveller is within this tolerance of the
// route (after discounting GPS uncertainty), the marker is displayed on the
// nearest point of the line.
const NAV_SNAP_SETTINGS = {
  // Engage the snap when this close to the route line...
  snapMeters: 42,
  // ...and only release it once this far off, so a fix hovering near the
  // boundary doesn't flip the marker back and forth.
  snapReleaseMeters: 78,
  accuracyDiscount: 0.5,
};

// Nearest point ON a route segment to the traveller, plus the perpendicular
// distance to it. Used both to snap the marker and to judge "on route".
function projectPointOntoRouteSegment(position, startCoord, endCoord) {
  const start = normalizeRoutePoint(startCoord);
  const end = normalizeRoutePoint(endCoord);
  const p = projectToMeters(position, position);
  const a = projectToMeters(start, position);
  const b = projectToMeters(end, position);

  const segmentX = b.x - a.x;
  const segmentY = b.y - a.y;
  const lengthSquared = segmentX * segmentX + segmentY * segmentY;

  if (!lengthSquared) return { point: start, distance: distanceInMeters(position, start) };

  const rawProjection = ((p.x - a.x) * segmentX + (p.y - a.y) * segmentY) / lengthSquared;
  const t = Math.max(0, Math.min(1, rawProjection));
  const point = { lat: lerp(start.lat, end.lat, t), lng: lerp(start.lng, end.lng, t) };
  return { point, distance: distanceInMeters(position, point) };
}

function getNearestPointOnRoute(position, coordinates = []) {
  if (!position || coordinates.length < 2) return null;

  let best = null;
  for (let index = 0; index < coordinates.length - 1; index += 1) {
    const projection = projectPointOntoRouteSegment(position, coordinates[index], coordinates[index + 1]);
    if (!best || projection.distance < best.distance) {
      best = { ...projection, segmentIndex: index };
    }
  }

  return best;
}

// Remaining route distance from the traveller's live position to the
// destination, following the drawn route rather than a straight line. This is
// what makes the direction card count down as the user progresses.
function getRemainingRouteMeters(position, coordinates = [], segmentIndex = 0) {
  if (!position || coordinates.length < 2) return null;

  const safeIndex = Math.max(0, Math.min(segmentIndex, coordinates.length - 2));
  const segmentEnd = normalizeRoutePoint(coordinates[safeIndex + 1]);
  let remaining = distanceInMeters(position, segmentEnd);

  for (let index = safeIndex + 1; index < coordinates.length - 1; index += 1) {
    const from = normalizeRoutePoint(coordinates[index]);
    const to = normalizeRoutePoint(coordinates[index + 1]);
    const segmentMeters = distanceInMeters(from, to);
    if (Number.isFinite(segmentMeters)) remaining += segmentMeters;
  }

  return Number.isFinite(remaining) ? remaining : null;
}

function isTileNetworkError(event) {
  const message = String(event?.error?.message || "").toLowerCase();
  const status = Number(event?.error?.status || event?.error?.statusCode || 0);
  const url = String(event?.error?.url || event?.sourceId || "");
  if (/failed to fetch|networkerror|load failed|err_internet|err_network|err_timed_out/.test(message)) {
    return true;
  }
  // 5xx or gateway errors from a tile host also mean the base map cannot draw.
  if (status >= 500) return true;
  return /tile|\/maps\/|openstreetmap|maptiler/i.test(url) && (status === 0 || status >= 400);
}

const MAPTILER_KEY = import.meta.env.VITE_MAPTILER_KEY;
const MAPTILER_STYLE_ID = import.meta.env.VITE_MAPTILER_STYLE_ID || "streets-v2";

const osmRasterStyle = {
  version: 8,
  sources: {
    "osm-tiles": {
      type: "raster",
      tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
      tileSize: 256,
      attribution: "© OpenStreetMap contributors",
    },
  },
  layers: [
    {
      id: "osm-tiles-layer",
      type: "raster",
      source: "osm-tiles",
      minzoom: 0,
      maxzoom: 19,
    },
  ],
};

function getMapTilerStyleUrl(styleId = MAPTILER_STYLE_ID) {
  if (!MAPTILER_KEY) return null;
  return `https://api.maptiler.com/maps/${styleId}/style.json?key=${MAPTILER_KEY}`;
}

function getInitialMapStyle() {
  return getMapTilerStyleUrl() || osmRasterStyle;
}

function isMapTilerRequestError(event) {
  const url = event?.error?.url || event?.sourceId || "";
  const status = event?.error?.status || event?.error?.statusCode;
  return String(url).includes("api.maptiler.com") || status === 401 || status === 403;
}

function createLabeledMarker(label, bgColor) {
  const wrapper = document.createElement("div");
  wrapper.style.position = "relative";
  wrapper.style.width = "78px";
  wrapper.style.height = "66px";
  wrapper.style.display = "flex";
  wrapper.style.alignItems = "center";
  wrapper.style.justifyContent = "center";
  wrapper.style.pointerEvents = "auto";

  const badge = document.createElement("div");
  badge.textContent = label;
  badge.style.position = "absolute";
  badge.style.top = "0";
  badge.style.left = "50%";
  badge.style.transform = "translateX(-50%)";
  badge.style.background = bgColor;
  badge.style.color = "white";
  badge.style.fontSize = "11px";
  badge.style.fontWeight = "900";
  badge.style.padding = "4px 9px";
  badge.style.borderRadius = "999px";
  badge.style.whiteSpace = "nowrap";
  badge.style.boxShadow = "0 8px 18px rgba(0,0,0,0.35)";
  badge.style.zIndex = "2";

  const pin = document.createElement("div");
  pin.style.position = "absolute";
  pin.style.top = "27px";
  pin.style.left = "50%";
  pin.style.transform = "translateX(-50%)";
  pin.style.width = "30px";
  pin.style.height = "30px";
  pin.style.borderRadius = "999px";
  pin.style.background = bgColor;
  pin.style.border = "4px solid white";
  pin.style.boxShadow = "0 8px 18px rgba(0,0,0,0.35)";
  pin.style.zIndex = "1";

  wrapper.appendChild(badge);
  wrapper.appendChild(pin);

  return wrapper;
}

function createMeasurementLabel(label) {
  const wrapper = document.createElement("div");
  wrapper.textContent = label;
  wrapper.style.background = "#16a34a";
  wrapper.style.color = "white";
  wrapper.style.fontSize = "13px";
  wrapper.style.fontWeight = "900";
  wrapper.style.padding = "6px 12px";
  wrapper.style.borderRadius = "999px";
  wrapper.style.border = "3px solid white";
  wrapper.style.boxShadow = "0 10px 24px rgba(0,0,0,0.35)";
  wrapper.style.whiteSpace = "nowrap";
  return wrapper;
}

function normalizeRoutePreviewPoint(point) {
  const rawLat = point?.lat ?? point?.latitude;
  const rawLng = point?.lng ?? point?.longitude;
  const lat = rawLat == null || rawLat === "" ? null : Number(rawLat);
  const lng = rawLng == null || rawLng === "" ? null : Number(rawLng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { ...point, lat, lng };
}

function normalizeLineStringCoordinates(geometry) {
  if (geometry?.type !== "LineString" || !Array.isArray(geometry.coordinates)) return [];

  return geometry.coordinates.filter((coordinate) => {
    const lng = Number(coordinate?.[0]);
    const lat = Number(coordinate?.[1]);
    return Number.isFinite(lat) && Number.isFinite(lng);
  });
}

function coordinateToPoint(coordinate) {
  const lng = Number(coordinate?.[0]);
  const lat = Number(coordinate?.[1]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

function getMeasurementPreviewCoordinates(origin, destination, geometry) {
  const routeCoordinates = normalizeLineStringCoordinates(geometry);
  if (routeCoordinates.length >= 2) return routeCoordinates;
  return [
    [origin.lng, origin.lat],
    [destination.lng, destination.lat],
  ];
}

function getCoordinateMidpoint(coordinates, fallback) {
  if (!Array.isArray(coordinates) || coordinates.length < 2) return fallback;

  const points = coordinates.map(coordinateToPoint).filter(Boolean);
  if (points.length < 2) return fallback;

  const segmentLengths = [];
  let totalMeters = 0;

  for (let index = 1; index < points.length; index += 1) {
    const segmentMeters = distanceInMeters(points[index - 1], points[index]);
    segmentLengths.push(segmentMeters);
    if (Number.isFinite(segmentMeters)) totalMeters += segmentMeters;
  }

  if (!Number.isFinite(totalMeters) || totalMeters <= 0) return fallback;

  const targetMeters = totalMeters / 2;
  let travelledMeters = 0;

  for (let index = 1; index < points.length; index += 1) {
    const segmentMeters = segmentLengths[index - 1];
    if (!Number.isFinite(segmentMeters) || segmentMeters <= 0) continue;

    if (travelledMeters + segmentMeters >= targetMeters) {
      const amount = (targetMeters - travelledMeters) / segmentMeters;
      return {
        lat: lerp(points[index - 1].lat, points[index].lat, amount),
        lng: lerp(points[index - 1].lng, points[index].lng, amount),
      };
    }

    travelledMeters += segmentMeters;
  }

  return points[Math.floor(points.length / 2)] || fallback;
}

function createLiveUserMarker() {
  const wrapper = document.createElement("div");
  wrapper.style.width = "74px";
  wrapper.style.height = "74px";
  wrapper.style.position = "relative";
  wrapper.style.display = "grid";
  wrapper.style.placeItems = "center";
  wrapper.style.pointerEvents = "auto";

  const pulse = document.createElement("div");
  pulse.style.position = "absolute";
  pulse.style.width = "58px";
  pulse.style.height = "58px";
  pulse.style.borderRadius = "999px";
  pulse.style.background = "rgba(22, 163, 74, 0.18)";
  pulse.style.border = "2px solid rgba(22, 163, 74, 0.24)";

  const dot = document.createElement("div");
  dot.style.width = "24px";
  dot.style.height = "24px";
  dot.style.borderRadius = "999px";
  dot.style.background = "#16a34a";
  dot.style.border = "4px solid white";
  dot.style.boxShadow = "0 10px 24px rgba(0,0,0,0.35)";
  dot.style.zIndex = "2";

  const label = document.createElement("div");
  label.textContent = "CURRENT\nLOCATION";
  label.style.textAlign = "center";
  label.style.lineHeight = "1.15";
  label.style.position = "absolute";
  label.style.top = "-2px";
  label.style.left = "50%";
  label.style.transform = "translateX(-50%)";
  label.style.background = "#16a34a";
  label.style.color = "white";
  label.style.fontSize = "10px";
  label.style.fontWeight = "900";
  label.style.padding = "3px 8px";
  label.style.borderRadius = "999px";
  label.style.boxShadow = "0 8px 18px rgba(0,0,0,0.30)";
  label.style.zIndex = "3";

  wrapper.appendChild(pulse);
  wrapper.appendChild(dot);
  wrapper.appendChild(label);

  return wrapper;
}


function createAreaLocationMarker(location) {
  const wrapper = document.createElement("button");
  wrapper.type = "button";
  wrapper.style.width = "44px";
  wrapper.style.height = "44px";
  wrapper.style.borderRadius = "999px";
  wrapper.style.display = "grid";
  wrapper.style.placeItems = "center";
  wrapper.style.background = "#0f172a";
  wrapper.style.border = "3px solid white";
  wrapper.style.boxShadow = "0 10px 24px rgba(0,0,0,0.35)";
  wrapper.style.color = "white";
  wrapper.style.fontSize = "18px";
  wrapper.style.cursor = "pointer";
  wrapper.title = location?.name || t("urride.areaMap.tNearbyLocation");
  wrapper.textContent = location?.category === "Emergency" ? "🚨" : "📍";
  return wrapper;
}

function LegacyReportMarker(report) {
  const wrapper = document.createElement("button");
  wrapper.type = "button";
  wrapper.style.width = "42px";
  wrapper.style.height = "42px";
  wrapper.style.borderRadius = "999px";
  wrapper.style.display = "grid";
  wrapper.style.placeItems = "center";
  wrapper.style.background = report?.severity === "critical" || report?.severity === "high" ? "#dc2626" : "#f97316";
  wrapper.style.border = "3px solid white";
  wrapper.style.boxShadow = "0 10px 24px rgba(0,0,0,0.35)";
  wrapper.style.color = "white";
  wrapper.style.fontSize = "18px";
  wrapper.style.cursor = "pointer";
  wrapper.title = report?.title || t("urride.areaMap.tRoadReport");
  wrapper.textContent = "⚠️";
  return wrapper;
}

function createTrafficMarker(snapshot) {
  const wrapper = document.createElement("div");
  const color = snapshot?.status === "red" ? "#dc2626" : snapshot?.status === "yellow" ? "#eab308" : "#16a34a";
  wrapper.style.width = "38px";
  wrapper.style.height = "38px";
  wrapper.style.borderRadius = "999px";
  wrapper.style.display = "grid";
  wrapper.style.placeItems = "center";
  wrapper.style.background = color;
  wrapper.style.border = "3px solid white";
  wrapper.style.boxShadow = "0 10px 24px rgba(0,0,0,0.35)";
  wrapper.style.color = "white";
  wrapper.style.fontSize = "16px";
  wrapper.title = snapshot?.message || t("urride.areaMap.tTrafficUpdate");
  wrapper.textContent = "●";
  return wrapper;
}

function LegacyOperatorMarker(operator) {
  const wrapper = document.createElement("div");
  wrapper.style.width = "48px";
  wrapper.style.height = "48px";
  wrapper.style.borderRadius = "999px";
  wrapper.style.display = "grid";
  wrapper.style.placeItems = "center";
  wrapper.style.background = operator?.available ? "#2563eb" : "#64748b";
  wrapper.style.border = "3px solid white";
  wrapper.style.boxShadow = "0 10px 24px rgba(0,0,0,0.35)";
  wrapper.style.color = "white";
  wrapper.style.fontSize = "20px";
  wrapper.title = operator?.name || t("urride.areaMap.tOperator");
  wrapper.textContent = operator?.type === "keke" ? "🛺" : operator?.type === "car" ? "🚗" : "🏍️";
  return wrapper;
}

function createSmartReportMarker(report) {
  const wrapper = document.createElement("button");
  const isDanger = ["critical", "high"].includes(report?.severity);
  const icon = {
    accident: "!",
    road_block: "X",
    flooding: "~",
    police_checkpoint: "P",
    traffic: "!",
    bad_road: "!",
    danger: "!",
    emergency: "!",
  }[report?.type || "traffic"] || "!";

  wrapper.type = "button";
  wrapper.style.width = "42px";
  wrapper.style.height = "42px";
  wrapper.style.borderRadius = "999px";
  wrapper.style.display = "grid";
  wrapper.style.placeItems = "center";
  wrapper.style.background = isDanger ? "#dc2626" : "#f97316";
  wrapper.style.border = "3px solid white";
  wrapper.style.boxShadow = "0 10px 24px rgba(0,0,0,0.35)";
  wrapper.style.color = "white";
  wrapper.style.fontSize = "17px";
  wrapper.style.fontWeight = "900";
  wrapper.style.cursor = "pointer";
  wrapper.title = report?.title || t("urride.areaMap.tRoadReport");
  wrapper.textContent = icon;
  return wrapper;
}

function SmartOperatorMarker(operator) {
  const wrapper = document.createElement("div");
  const icon = {
    bike: "🏍️",
    keke: "🛺",
    car: "🚗",
    van: "🚐",
  }[operator?.type] || "🏍️";

  wrapper.style.width = "48px";
  wrapper.style.height = "48px";
  wrapper.style.borderRadius = "999px";
  wrapper.style.display = "grid";
  wrapper.style.placeItems = "center";
  wrapper.style.background = operator?.available ? "#2563eb" : "#64748b";
  wrapper.style.border = "3px solid white";
  wrapper.style.boxShadow = "0 10px 24px rgba(0,0,0,0.35)";
  wrapper.style.color = "white";
  wrapper.style.fontSize = "20px";
  wrapper.title = operator?.name || t("urride.areaMap.tOperator");

  const iconNode = document.createElement("span");
  iconNode.dataset.operatorIcon = "true";
  iconNode.textContent = icon;
  iconNode.style.display = "inline-block";
  iconNode.style.transformOrigin = "center";

  wrapper.appendChild(iconNode);
  updateOperatorMarkerElement(wrapper, operator);
  return wrapper;
}

function updateOperatorMarkerElement(element, operator) {
  if (!element) return;

  const iconNode = element.querySelector("[data-operator-icon='true']");
  const icon = {
    bike: "🏍️",
    keke: "🛺",
    car: "🚗",
    van: "🚐",
  }[operator?.type] || "🏍️";

  element.style.background = operator?.available ? "#2563eb" : "#64748b";
  element.title = operator?.name || "Operator";

  if (iconNode) {
    iconNode.textContent = icon;
    iconNode.style.transform = Number.isFinite(Number(operator?.heading))
      ? `rotate(${Number(operator.heading)}deg)`
      : "none";
  }
}

function getLiveFleetMarkerConfig(operator) {
  const booked = Boolean(operator?.booked || String(operator?.status || "").toLowerCase() === "busy");
  const type = String(operator?.type || "bike").toLowerCase();
  const fallback = {
    label: i18nText("ui.literals.ke1991511907c"),
    bg: booked ? "#f97316" : "#0f172a",
    svg: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 16h14M6.5 16l1.4-5.2c.3-.9 1-1.5 2-1.5h4.2c1 0 1.8.6 2 1.5L17.5 16"/><circle cx="7.5" cy="19" r="1.5"/><circle cx="16.5" cy="19" r="1.5"/></svg>',
  };

  const byType = {
    bike: {
      label: i18nText("ui.literals.k3a12a2c6c506"),
      bg: booked ? "#f97316" : "#16a34a",
      svg: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="6" cy="17" r="2.6"/><circle cx="18" cy="17" r="2.6"/><path d="M7 17l3-7h3l2.5 4H18l-2-5h2.4l1.1 2.2M10 10H7.5M12.8 10l-2.4 7"/></svg>',
    },
    keke: {
      label: "Tricycle",
      bg: booked ? "#f97316" : "#2563eb",
      svg: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 13.5h10.5l2.2 3H20M5 13.5V9.2c0-1.1.8-2 1.9-2h5.2c1.2 0 2.1.9 2.1 2v4.3M7.3 9.3h4.9M5.5 16.5h1M12.3 16.5h1"/><circle cx="6.5" cy="17" r="2.2"/><circle cx="14" cy="17" r="2.2"/><circle cx="20" cy="17" r="2.2"/></svg>',
    },
    car: {
      label: "Taxi",
      bg: booked ? "#f97316" : "#0f172a",
      svg: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 16h14M6.5 16l1.4-5.2c.3-.9 1-1.5 2-1.5h4.2c1 0 1.8.6 2 1.5L17.5 16M8 9.3V7h8v2.3M6 16v3M18 16v3"/><circle cx="7.5" cy="19" r="1.5"/><circle cx="16.5" cy="19" r="1.5"/></svg>',
    },
    van: {
      label: "Van",
      bg: booked ? "#f97316" : "#7c3aed",
      svg: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9.5h10v8H4zM14 12h3.8l2.2 3.2v2.3h-6M5.8 9.5V7h7v2.5M17.7 13.8h1.4"/><circle cx="7" cy="18" r="2"/><circle cx="17" cy="18" r="2"/></svg>',
    },
  };

  return { ...(byType[type] || fallback), booked };
}

function createLiveFleetOperatorMarker(operator) {
  const wrapper = document.createElement("div");
  wrapper.style.position = "relative";
  wrapper.style.width = "78px";
  wrapper.style.height = "78px";
  wrapper.style.display = "grid";
  wrapper.style.placeItems = "center";
  wrapper.style.pointerEvents = "auto";
  wrapper.style.cursor = "pointer";

  const shell = document.createElement("div");
  shell.dataset.liveFleetShell = "true";
  shell.style.width = "48px";
  shell.style.height = "48px";
  shell.style.borderRadius = "999px";
  shell.style.display = "grid";
  shell.style.placeItems = "center";
  shell.style.border = "3px solid white";
  shell.style.boxShadow = "0 12px 26px rgba(15,23,42,0.38)";
  shell.style.color = "white";

  const icon = document.createElement("span");
  icon.dataset.liveFleetIcon = "true";
  icon.style.display = "grid";
  icon.style.placeItems = "center";
  icon.style.width = "27px";
  icon.style.height = "27px";
  icon.style.transformOrigin = "center";

  const liveDot = document.createElement("span");
  liveDot.dataset.liveFleetDot = "true";
  liveDot.style.position = "absolute";
  liveDot.style.right = "17px";
  liveDot.style.top = "13px";
  liveDot.style.width = "10px";
  liveDot.style.height = "10px";
  liveDot.style.borderRadius = "999px";
  liveDot.style.border = "2px solid white";

  const bookedBadge = document.createElement("span");
  bookedBadge.dataset.liveFleetBooked = "true";
  bookedBadge.style.position = "absolute";
  bookedBadge.style.left = "50%";
  bookedBadge.style.bottom = "2px";
  bookedBadge.style.transform = "translateX(-50%)";
  bookedBadge.style.borderRadius = "999px";
  bookedBadge.style.background = "#f97316";
  bookedBadge.style.color = "white";
  bookedBadge.style.fontSize = "9px";
  bookedBadge.style.fontWeight = "900";
  bookedBadge.style.letterSpacing = "0";
  bookedBadge.style.padding = "3px 7px";
  bookedBadge.style.boxShadow = "0 8px 18px rgba(15,23,42,0.28)";
  bookedBadge.style.whiteSpace = "nowrap";

  shell.appendChild(icon);
  wrapper.appendChild(shell);
  wrapper.appendChild(liveDot);
  wrapper.appendChild(bookedBadge);
  updateLiveFleetOperatorMarkerElement(wrapper, operator);
  return wrapper;
}

function updateLiveFleetOperatorMarkerElement(element, operator) {
  if (!element) return;

  const config = getLiveFleetMarkerConfig(operator);
  const shell = element.querySelector("[data-live-fleet-shell='true']");
  const icon = element.querySelector("[data-live-fleet-icon='true']");
  const liveDot = element.querySelector("[data-live-fleet-dot='true']");
  const bookedBadge = element.querySelector("[data-live-fleet-booked='true']");

  element.title = [operator?.name || t("urride.areaMap.tActiveOperator"), config.label, config.booked ? t("urride.areaMap.tBooked") : t("urride.areaMap.tAvailable")]
    .filter(Boolean)
    .join(" - ");

  if (shell) shell.style.background = config.bg;

  if (icon) {
    icon.innerHTML = config.svg;
    const svg = icon.querySelector("svg");
    if (svg) {
      svg.style.width = "100%";
      svg.style.height = "100%";
      svg.style.fill = "none";
      svg.style.stroke = "currentColor";
      svg.style.strokeWidth = "2.2";
      svg.style.strokeLinecap = "round";
      svg.style.strokeLinejoin = "round";
    }
    icon.style.transform = Number.isFinite(Number(operator?.heading))
      ? `rotate(${Number(operator.heading)}deg)`
      : "none";
  }

  if (liveDot) {
    liveDot.style.background = config.booked ? "#fb923c" : "#22c55e";
    liveDot.style.boxShadow = config.booked
      ? "0 0 0 3px rgba(251,146,60,0.2)"
      : "0 0 0 3px rgba(34,197,94,0.2)";
  }

  if (bookedBadge) {
    bookedBadge.textContent = config.booked ? t("urride.areaMap.markerBooked") : "";
    bookedBadge.style.display = config.booked ? "inline-flex" : "none";
  }
}

function toRadians(value) {
  return (value * Math.PI) / 180;
}

function distanceInMeters(pointA, pointB) {
  const earthRadius = 6371000;
  const lat1 = toRadians(pointA.lat);
  const lat2 = toRadians(pointB.lat);
  const deltaLat = toRadians(pointB.lat - pointA.lat);
  const deltaLng = toRadians(pointB.lng - pointA.lng);

  const a =
    Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
    Math.cos(lat1) *
      Math.cos(lat2) *
      Math.sin(deltaLng / 2) *
      Math.sin(deltaLng / 2);

  return earthRadius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function lerp(start, end, amount) {
  return start + (end - start) * amount;
}

function easeOutCubic(value) {
  return 1 - Math.pow(1 - value, 3);
}


function normalizeBearing(value) {
  if (value == null || Number.isNaN(Number(value))) return null;
  return ((Number(value) % 360) + 360) % 360;
}

function bearingBetweenPoints(from, to) {
  if (!from || !to) return 0;
  const startLat = toRadians(from.lat);
  const endLat = toRadians(to.lat);
  const deltaLng = toRadians(to.lng - from.lng);
  const y = Math.sin(deltaLng) * Math.cos(endLat);
  const x =
    Math.cos(startLat) * Math.sin(endLat) -
    Math.sin(startLat) * Math.cos(endLat) * Math.cos(deltaLng);

  return normalizeBearing((Math.atan2(y, x) * 180) / Math.PI) || 0;
}

function getNextRouteBearing(position, coordinates = [], segmentIndex = 0) {
  if (!position || coordinates.length < 2) return null;

  const safeIndex = Math.max(0, Math.min(segmentIndex, coordinates.length - 2));
  const lookAheadIndex = Math.max(safeIndex + 1, Math.min(safeIndex + 6, coordinates.length - 1));
  const target = normalizeRoutePoint(coordinates[lookAheadIndex]);

  return bearingBetweenPoints(position, target);
}

function getSmartCameraCenter(position) {
  // The traveller stays at the viewport centre; the map (and the road ahead)
  // moves underneath. The look-ahead is still used for the camera *bearing*,
  // just not to offset the centre away from the marker.
  return position || null;
}

function getTrafficLevel(route, routeStatusKey) {
  if (!route?.distanceMeters || !route?.durationSeconds) {
    return { label: t("urride.areaMap.tlChecking"), detail: t("urride.areaMap.tlCheckingDetail"), className: "bg-slate-100 text-slate-600" };
  }

  const speedKmh = (route.distanceMeters / Math.max(route.durationSeconds, 1)) * 3.6;
  const hour = new Date().getHours();
  const isPeakTime = (hour >= 7 && hour <= 10) || (hour >= 16 && hour <= 20);

  if (routeStatusKey === "wrong") {
    return { label: t("urride.areaMap.tlRiskHigh"), detail: t("urride.areaMap.tlRiskHighDetail"), className: "bg-red-100 text-red-700" };
  }

  if (routeStatusKey === "warning" || speedKmh < 13 || isPeakTime) {
    return { label: t("urride.areaMap.tlSlow"), detail: t("urride.areaMap.tlSlowDetail"), className: "bg-yellow-100 text-yellow-700" };
  }

  return { label: t("urride.areaMap.tlNormal"), detail: t("urride.areaMap.tlNormalDetail"), className: "bg-green-100 text-green-700" };
}

function getLiveTrafficInsight(trafficSnapshots = [], route, routeStatusKey) {
  const activeSnapshots = trafficSnapshots.filter((snapshot) => snapshot?.status && snapshot.status !== "green");
  const redSnapshot = activeSnapshots.find((snapshot) => snapshot.status === "red");
  const yellowSnapshot = activeSnapshots.find((snapshot) => snapshot.status === "yellow");

  if (redSnapshot) {
    return {
      label: t("urride.areaMap.ltDanger"),
      detail: redSnapshot.message || redSnapshot.roadName || t("urride.areaMap.ltDangerDetail"),
      className: "bg-red-100 text-red-700",
    };
  }

  if (yellowSnapshot) {
    return {
      label: t("urride.areaMap.ltCaution"),
      detail: yellowSnapshot.message || yellowSnapshot.roadName || t("urride.areaMap.ltCautionDetail"),
      className: "bg-yellow-100 text-yellow-700",
    };
  }

  return getTrafficLevel(route, routeStatusKey);
}

function LegacyWeatherMessage(currentWeather) {
  if (!currentWeather) {
    return { label: i18nText("ui.literals.ka9ca9bc45ff5"), detail: i18nText("ui.literals.kec9c9e54e919"), className: "bg-slate-100 text-slate-600" };
  }

  const code = Number(currentWeather.weather_code ?? currentWeather.weathercode ?? 0);
  const temperature = Math.round(currentWeather.temperature_2m ?? currentWeather.temperature ?? 0);
  const wind = Math.round(currentWeather.wind_speed_10m ?? currentWeather.windspeed ?? 0);
  const isRain = [51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82, 95, 96, 99].includes(code);
  const isFog = [45, 48].includes(code);

  if (isRain) {
    return { label: i18nText("ui.literals.k70777836253d", { value0: temperature }), detail: i18nText("ui.literals.k0cca300c1dc1", { value0: wind }), className: "bg-blue-100 text-blue-700" };
  }

  if (isFog) {
    return { label: i18nText("ui.literals.k952da1b8c612", { value0: temperature }), detail: i18nText("ui.literals.kc39c99da1caa", { value0: wind }), className: "bg-yellow-100 text-yellow-700" };
  }

  return { label: i18nText("ui.literals.kbb29b730f2fc", { value0: temperature }), detail: i18nText("ui.literals.k3b16e375b09e", { value0: wind }), className: "bg-sky-100 text-sky-700" };
}

function getSmartWeatherMessage(currentWeather) {
  if (!currentWeather) {
    return {
      label: t("urride.areaMap.wChecking"),
      detail: t("urride.areaMap.wCheckingDetail"),
      className: "bg-slate-100 text-slate-600",
      relevant: false,
    };
  }

  const code = Number(currentWeather.weather_code ?? currentWeather.weathercode ?? 0);
  const temperature = Math.round(
    currentWeather.temperatureC ??
      currentWeather.temperature_c ??
      currentWeather.temperature_2m ??
      currentWeather.temperature ??
      0,
  );
  const windMps = Number(currentWeather.windSpeedMps ?? currentWeather.wind_speed_mps ?? 0);
  const wind = Math.round(currentWeather.wind_speed_10m ?? currentWeather.windspeed ?? windMps * 3.6);
  const rainMm = Number(currentWeather.rain1hMm ?? currentWeather.rain_1h_mm ?? 0);
  const visibility = Number(currentWeather.visibilityMeters ?? currentWeather.visibility_meters ?? 0);
  const riskLevel = String(currentWeather.riskLevel ?? currentWeather.risk_level ?? "normal").toLowerCase();
  const message = currentWeather.message || currentWeather.description || "";
  const isRain = [51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82, 95, 96, 99].includes(code);
  const isFog = [45, 48].includes(code);
  const hasRainRisk = isRain || rainMm > 0.4 || ["risky", "danger"].includes(riskLevel);
  const hasVisibilityRisk = isFog || (visibility > 0 && visibility < 2500);

  if (riskLevel === "danger") {
    return {
      label: t("urride.areaMap.wDanger", { temp: temperature }),
      detail: message || t("urride.areaMap.wDangerDetail"),
      className: "bg-red-100 text-red-700",
      relevant: true,
    };
  }

  if (hasRainRisk) {
    return {
      label: t("urride.areaMap.wRain", { temp: temperature }),
      detail: message || t("urride.areaMap.wRainDetail", { wind }),
      className: "bg-blue-100 text-blue-700",
      relevant: true,
    };
  }

  if (hasVisibilityRisk || riskLevel === "caution") {
    return {
      label: t("urride.areaMap.wVisibility", { temp: temperature }),
      detail: message || t("urride.areaMap.wVisibilityDetail", { wind }),
      className: "bg-yellow-100 text-yellow-700",
      relevant: true,
    };
  }

  return {
    label: t("urride.areaMap.wClear", { temp: temperature }),
    detail: message || t("urride.areaMap.wClearDetail", { wind }),
    className: "bg-sky-100 text-sky-700",
    relevant: false,
  };
}

function normalizeRoutePoint(coord) {
  return { lng: coord[0], lat: coord[1] };
}

function projectToMeters(point, origin) {
  const metersPerDegreeLat = 111320;
  const metersPerDegreeLng = 111320 * Math.cos(toRadians(origin.lat));

  return {
    x: (point.lng - origin.lng) * metersPerDegreeLng,
    y: (point.lat - origin.lat) * metersPerDegreeLat,
  };
}

function distanceToRouteSegment(position, startCoord, endCoord) {
  const start = normalizeRoutePoint(startCoord);
  const end = normalizeRoutePoint(endCoord);
  const origin = position;

  const p = projectToMeters(position, origin);
  const a = projectToMeters(start, origin);
  const b = projectToMeters(end, origin);

  const segmentX = b.x - a.x;
  const segmentY = b.y - a.y;
  const segmentLengthSquared = segmentX * segmentX + segmentY * segmentY;

  if (!segmentLengthSquared) return distanceInMeters(position, start);

  const projection = ((p.x - a.x) * segmentX + (p.y - a.y) * segmentY) / segmentLengthSquared;
  const clampedProjection = Math.max(0, Math.min(1, projection));

  const nearest = {
    x: a.x + clampedProjection * segmentX,
    y: a.y + clampedProjection * segmentY,
  };

  const deltaX = p.x - nearest.x;
  const deltaY = p.y - nearest.y;

  return Math.sqrt(deltaX * deltaX + deltaY * deltaY);
}

function getNearestRouteInfo(position, coordinates = []) {
  if (!position || coordinates.length < 2) {
    return { distance: Infinity, segmentIndex: 0 };
  }

  let nearestDistance = Infinity;
  let nearestSegmentIndex = 0;

  for (let index = 0; index < coordinates.length - 1; index += 1) {
    const distance = distanceToRouteSegment(position, coordinates[index], coordinates[index + 1]);

    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearestSegmentIndex = index;
    }
  }

  return { distance: nearestDistance, segmentIndex: nearestSegmentIndex };
}

function getSignalStatus(signal) {
  const status = String(signal?.status || "").toLowerCase();
  const severity = String(signal?.severity || "").toLowerCase();

  if (status === "red" || ["critical", "high", "danger", "red"].includes(severity)) return "red";
  if (status === "yellow" || ["medium", "moderate", "warning", "yellow"].includes(severity)) return "yellow";
  return "green";
}

function getTrafficSignalPoint(signal) {
  const lat = Number(signal?.lat);
  const lng = Number(signal?.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

function getAffectedRouteGeometry(coordinates = [], segmentIndex = 0) {
  if (coordinates.length < 2) return null;
  const start = Math.max(0, segmentIndex - TRAFFIC_AHEAD_SETTINGS.affectedSegmentsBefore);
  const end = Math.min(coordinates.length - 1, segmentIndex + TRAFFIC_AHEAD_SETTINGS.affectedSegmentsAfter);
  const slice = coordinates.slice(start, end + 1);
  if (slice.length < 2) return null;

  return {
    type: "LineString",
    coordinates: slice,
  };
}

function detectTrafficAhead({
  position,
  routeCoordinates = [],
  currentSegmentIndex = 0,
  reports = [],
  trafficSnapshots = [],
}) {
  if (!position || routeCoordinates.length < 2) return null;

  const signals = [
    ...trafficSnapshots.map((snapshot) => ({
      ...snapshot,
      signalKind: "traffic",
      status: getSignalStatus(snapshot),
      label: snapshot.message || snapshot.roadName || snapshot.areaName || t("urride.areaMap.taSnapshotFallback"),
    })),
    ...reports.map((report) => ({
      ...report,
      signalKind: "report",
      status: getSignalStatus(report),
      label: report.title || report.description || t("urride.areaMap.taReportFallback"),
    })),
  ];

  const candidates = signals
    .map((signal) => {
      const point = getTrafficSignalPoint(signal);
      const status = getSignalStatus(signal);
      if (!point || !["yellow", "red"].includes(status)) return null;

      const nearest = getNearestRouteInfo(point, routeCoordinates);
      const routeDistanceLimit = Math.min(
        TRAFFIC_AHEAD_SETTINGS.routeDistanceMeters,
        Math.max(80, Number(signal.radiusMeters || 120)),
      );

      if (nearest.distance > routeDistanceLimit) return null;
      if (nearest.segmentIndex + 1 < currentSegmentIndex) return null;

      const userDistance = distanceInMeters(position, point);
      if (userDistance < TRAFFIC_AHEAD_SETTINGS.minUserDistanceMeters && nearest.segmentIndex <= currentSegmentIndex) {
        return null;
      }

      return {
        id: signal.id,
        status,
        label: t("urride.areaMap.taLabel"),
        detail: signal.label || signal.message || signal.description || t("urride.areaMap.taDetailFallback"),
        roadName: signal.roadName || signal.areaName || t("urride.areaMap.taRoadFallback"),
        distanceMeters: userDistance,
        routeDistanceMeters: nearest.distance,
        segmentIndex: nearest.segmentIndex,
        geometry: getAffectedRouteGeometry(routeCoordinates, nearest.segmentIndex),
        source: signal.signalKind || signal.source || "live",
      };
    })
    .filter(Boolean)
    .sort((a, b) => {
      const severityDelta = (b.status === "red" ? 2 : 1) - (a.status === "red" ? 2 : 1);
      if (severityDelta) return severityDelta;
      return a.segmentIndex - b.segmentIndex || a.distanceMeters - b.distanceMeters;
    });

  return candidates[0] || null;
}

function getRouteStatus(distanceFromRoute, isMovingBackward) {
  if (isMovingBackward) return "wrong";
  if (distanceFromRoute <= GPS_SETTINGS.correctRouteMeters) return "correct";
  if (distanceFromRoute <= GPS_SETTINGS.warningRouteMeters) return "warning";
  return "wrong";
}

function setRouteLineColor(map, color) {
  if (map?.getLayer("route-line-glow")) {
    map.setPaintProperty("route-line-glow", "line-color", color);
  }

  if (map?.getLayer("route-line")) {
    map.setPaintProperty("route-line", "line-color", color);
  }
}

function getAccuracyWeight(accuracy) {
  if (!accuracy) return 0.36;
  if (accuracy <= 15) return 0.58;
  if (accuracy <= 30) return 0.46;
  if (accuracy <= 60) return 0.32;
  if (accuracy <= 100) return 0.22;
  return 0.14;
}

function clampPositionToward(previousPosition, nextPosition, maxMeters) {
  const distance = distanceInMeters(previousPosition, nextPosition);

  if (!distance || distance <= maxMeters) return nextPosition;

  const ratio = maxMeters / distance;

  return {
    ...nextPosition,
    lat: lerp(previousPosition.lat, nextPosition.lat, ratio),
    lng: lerp(previousPosition.lng, nextPosition.lng, ratio),
  };
}

function getSmoothedPosition(previousPosition, nextPosition, elapsedMs = 1000) {
  if (!previousPosition) return nextPosition;

  const distance = distanceInMeters(previousPosition, nextPosition);

  if (distance <= GPS_SETTINGS.ignoreTinyMoveMeters) return previousPosition;

  const elapsedSeconds = Math.max(elapsedMs / 1000, 0.8);
  const accuracy = Number(nextPosition.accuracy || 0);
  const maxTrustedMove = Math.max(12, elapsedSeconds * 18 + accuracy * 0.45);
  const stableTarget = clampPositionToward(previousPosition, nextPosition, maxTrustedMove);
  const stableDistance = distanceInMeters(previousPosition, stableTarget);
  const accuracyWeight = getAccuracyWeight(accuracy);
  const movementWeight = stableDistance > 45 ? 0.5 : stableDistance > 18 ? 0.42 : accuracyWeight;
  const smoothingPower = Math.min(0.62, Math.max(0.16, Math.min(accuracyWeight, movementWeight)));

  return {
    ...nextPosition,
    lat: lerp(previousPosition.lat, stableTarget.lat, smoothingPower),
    lng: lerp(previousPosition.lng, stableTarget.lng, smoothingPower),
  };
}

function getMarkerPosition(marker, fallback) {
  const lngLat = marker?.getLngLat?.();

  if (!lngLat) return fallback || null;

  return {
    lat: lngLat.lat,
    lng: lngLat.lng,
  };
}

function waitForMapStyle(map) {
  if (!map || map.isStyleLoaded()) return Promise.resolve();

  return new Promise((resolve) => {
    map.once("load", resolve);
  });
}

function clearRouteLayers(map) {
  if (!map) return;

  if (map.getLayer("route-line")) map.removeLayer("route-line");
  if (map.getLayer("route-line-glow")) map.removeLayer("route-line-glow");
  if (map.getSource("route")) map.removeSource("route");
}

function clearMeasurementPreviewLayer(map) {
  if (!map) return;

  try {
    if (map.getLayer("measurement-preview-line")) map.removeLayer("measurement-preview-line");
    if (map.getLayer("measurement-preview-glow")) map.removeLayer("measurement-preview-glow");
    if (map.getSource("measurement-preview")) map.removeSource("measurement-preview");
  } catch {
    // The map style can already be gone during teardown.
  }
}

function upsertMeasurementPreviewLayer(map, coordinates) {
  if (!map || !Array.isArray(coordinates) || coordinates.length < 2) return;

  const data = {
    type: "Feature",
    geometry: {
      type: "LineString",
      coordinates,
    },
  };

  if (map.getSource("measurement-preview")) {
    map.getSource("measurement-preview").setData(data);
    return;
  }

  map.addSource("measurement-preview", {
    type: "geojson",
    data,
  });

  map.addLayer({
    id: "measurement-preview-glow",
    type: "line",
    source: "measurement-preview",
    layout: {
      "line-join": "round",
      "line-cap": "round",
    },
    paint: {
      "line-color": "#16a34a",
      "line-width": 18,
      "line-opacity": 0.22,
    },
  });

  map.addLayer({
    id: "measurement-preview-line",
    type: "line",
    source: "measurement-preview",
    layout: {
      "line-join": "round",
      "line-cap": "round",
    },
    paint: {
      "line-color": "#16a34a",
      "line-width": 6,
      "line-opacity": 0.94,
    },
  });
}

function upsertRouteLayers(map, geometry, color = ROUTE_STATUS.correct.color) {
  if (!map || !geometry) return;

  const data = {
    type: "Feature",
    geometry,
  };

  if (map.getSource("route")) {
    map.getSource("route").setData(data);
    setRouteLineColor(map, color);
    return;
  }

  map.addSource("route", {
    type: "geojson",
    data,
  });

  map.addLayer({
    id: "route-line-glow",
    type: "line",
    source: "route",
    layout: {
      "line-join": "round",
      "line-cap": "round",
    },
    paint: {
      "line-color": color,
      "line-width": 15,
      "line-opacity": 0.22,
    },
  });

  map.addLayer({
    id: "route-line",
    type: "line",
    source: "route",
    layout: {
      "line-join": "round",
      "line-cap": "round",
    },
    paint: {
      "line-color": color,
      "line-width": 7,
      "line-opacity": 0.95,
    },
  });
}

function buildTrafficOverlayGeoJson(trafficSnapshots = []) {
  return {
    type: "FeatureCollection",
    features: trafficSnapshots
      .filter((snapshot) => snapshot?.lat != null && snapshot?.lng != null && snapshot.status !== "green")
      .map((snapshot) => ({
        type: "Feature",
        properties: {
          id: snapshot.id,
          status: snapshot.status,
          message: snapshot.message || "",
          pixelRadius: Math.max(26, Math.min(86, Number(snapshot.radiusMeters || 500) / 10)),
        },
        geometry: {
          type: "Point",
          coordinates: [snapshot.lng, snapshot.lat],
        },
      })),
  };
}

function upsertTrafficOverlayLayers(map, trafficSnapshots = []) {
  if (!map) return;

  const data = buildTrafficOverlayGeoJson(trafficSnapshots);

  if (map.getSource("traffic-zones")) {
    map.getSource("traffic-zones").setData(data);
    return;
  }

  map.addSource("traffic-zones", {
    type: "geojson",
    data,
  });

  map.addLayer({
    id: "traffic-zone-fill",
    type: "circle",
    source: "traffic-zones",
    paint: {
      "circle-radius": ["get", "pixelRadius"],
      "circle-color": [
        "match",
        ["get", "status"],
        "red",
        "#dc2626",
        "yellow",
        "#eab308",
        "#16a34a",
      ],
      "circle-opacity": 0.12,
    },
  });

  map.addLayer({
    id: "traffic-zone-ring",
    type: "circle",
    source: "traffic-zones",
    paint: {
      "circle-radius": ["get", "pixelRadius"],
      "circle-color": "rgba(255,255,255,0)",
      "circle-stroke-width": 2,
      "circle-stroke-color": [
        "match",
        ["get", "status"],
        "red",
        "#dc2626",
        "yellow",
        "#eab308",
        "#16a34a",
      ],
      "circle-stroke-opacity": 0.28,
    },
  });
}

function clearTrafficOverlayLayers(map) {
  if (!map) return;
  if (map.getLayer("traffic-zone-ring")) map.removeLayer("traffic-zone-ring");
  if (map.getLayer("traffic-zone-fill")) map.removeLayer("traffic-zone-fill");
  if (map.getSource("traffic-zones")) map.removeSource("traffic-zones");
}

function upsertTrafficAheadRouteLayer(map, geometry, status = "yellow") {
  if (!map) return;

  const data = {
    type: "Feature",
    geometry: geometry || {
      type: "LineString",
      coordinates: [],
    },
  };
  const color = status === "red" ? "#dc2626" : "#eab308";

  if (map.getSource("route-traffic-ahead")) {
    map.getSource("route-traffic-ahead").setData(data);
    if (map.getLayer("route-traffic-ahead-line")) {
      map.setPaintProperty("route-traffic-ahead-line", "line-color", color);
    }
    if (map.getLayer("route-traffic-ahead-glow")) {
      map.setPaintProperty("route-traffic-ahead-glow", "line-color", color);
    }
    return;
  }

  map.addSource("route-traffic-ahead", {
    type: "geojson",
    data,
  });

  map.addLayer({
    id: "route-traffic-ahead-glow",
    type: "line",
    source: "route-traffic-ahead",
    layout: {
      "line-join": "round",
      "line-cap": "round",
    },
    paint: {
      "line-color": color,
      "line-width": 20,
      "line-opacity": 0.22,
    },
  });

  map.addLayer({
    id: "route-traffic-ahead-line",
    type: "line",
    source: "route-traffic-ahead",
    layout: {
      "line-join": "round",
      "line-cap": "round",
    },
    paint: {
      "line-color": color,
      "line-width": 8,
      "line-opacity": 0.94,
      "line-dasharray": [1.4, 1.2],
    },
  });
}

function clearTrafficAheadRouteLayer(map) {
  if (!map) return;
  if (map.getLayer("route-traffic-ahead-line")) map.removeLayer("route-traffic-ahead-line");
  if (map.getLayer("route-traffic-ahead-glow")) map.removeLayer("route-traffic-ahead-glow");
  if (map.getSource("route-traffic-ahead")) map.removeSource("route-traffic-ahead");
}

function upsertAlternativeRouteLayer(map, geometry) {
  if (!map || !geometry) return;

  const data = {
    type: "Feature",
    geometry,
  };

  if (map.getSource("route-alternative")) {
    map.getSource("route-alternative").setData(data);
    return;
  }

  map.addSource("route-alternative", {
    type: "geojson",
    data,
  });

  map.addLayer({
    id: "route-alternative-line",
    type: "line",
    source: "route-alternative",
    layout: {
      "line-join": "round",
      "line-cap": "round",
    },
    paint: {
      "line-color": "#0f172a",
      "line-width": 5,
      "line-opacity": 0.7,
      "line-dasharray": [1.2, 1.2],
    },
  });
}

function clearAlternativeRouteLayer(map) {
  if (!map) return;
  if (map.getLayer("route-alternative-line")) map.removeLayer("route-alternative-line");
  if (map.getSource("route-alternative")) map.removeSource("route-alternative");
}

function animateMarkerTo(marker, fromPosition, toPosition, duration = GPS_SETTINGS.animationMs, onFrame) {
  if (!marker || !fromPosition || !toPosition) return null;

  const startedAt = performance.now();
  let frameId = null;

  function step(now) {
    const progress = Math.min((now - startedAt) / duration, 1);
    const easedProgress = easeOutCubic(progress);

    const nextLng = lerp(fromPosition.lng, toPosition.lng, easedProgress);
    const nextLat = lerp(fromPosition.lat, toPosition.lat, easedProgress);
    const renderedPosition = { lng: nextLng, lat: nextLat };

    marker.setLngLat([renderedPosition.lng, renderedPosition.lat]);
    onFrame?.(renderedPosition);

    if (progress < 1) frameId = requestAnimationFrame(step);
  }

  frameId = requestAnimationFrame(step);

  return () => {
    if (frameId) cancelAnimationFrame(frameId);
  };
}

export default function NearbyAreaMap({
  children,
  onLocationResolved,
  onMapReady,
  selectedLocation,
  routePlan = null,
  focusMode = false,
  operatorLocations = [],
  nearbyMapLocations = [],
  reportLocations = [],
  trafficSnapshots = [],
  weatherCache = null,
  onMapLocationSelect,
  onReportSelect,
  onMapInteractionStart,
  onMapInteractionEnd,
  recenterSignal = 0,
  measurementPreview = null,
}) {
  useI18n();
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const userMarkerRef = useRef(null);
  const pickupMarkerRef = useRef(null);
  const destinationMarkerRef = useRef(null);
  const measurementStartMarkerRef = useRef(null);
  const measurementEndMarkerRef = useRef(null);
  const measurementLabelMarkerRef = useRef(null);
  const watchIdRef = useRef(null);
  const routeCoordinatesRef = useRef([]);
  const smoothedPositionRef = useRef(null);
  const markerRenderedPositionRef = useRef(null);
  const markerAnimationCancelRef = useRef(null);
  const lastRouteSegmentIndexRef = useRef(0);
  const operatorMarkersRef = useRef(new Map());
  const operatorAnimationCancelRef = useRef(new Map());
  const areaLocationMarkersRef = useRef(new Map());
  const reportMarkersRef = useRef(new Map());
  const trafficMarkersRef = useRef(new Map());
  const trafficSnapshotsRef = useRef([]);
  const reportLocationsRef = useRef([]);
  const trafficAheadRef = useRef(null);
  const trafficAheadCheckAtRef = useRef(0);
  const routeStatusRef = useRef("correct");
  const routeInfoRef = useRef(null);
  const routeStartOverrideRef = useRef(null);
  const originalRouteRef = useRef(null);
  const alternativeRouteRef = useRef(null);
  const alternativeRouteRequestRef = useRef(0);
  const rerouteTimerRef = useRef(null);
  const lastRerouteAtRef = useRef(0);
  const arrivalReachedRef = useRef(false);
  const lastCameraMoveRef = useRef(0);
  const userLocationRef = useRef(null);
  const lastRawPositionRef = useRef(null);
  const lastRawTimestampRef = useRef(null);
  const headingRef = useRef(null);
  const smartCameraRef = useRef(true);
  const weatherCacheRef = useRef(weatherCache);
  const onMapInteractionStartRef = useRef(onMapInteractionStart);
  const onMapInteractionEndRef = useRef(onMapInteractionEnd);
  const isUserInteractingRef = useRef(false);
  const userInteractionIdleTimerRef = useRef(null);
  const lastParentLocationRef = useRef(null);
  const lastParentLocationAtRef = useRef(0);
  const gpsUiRef = useRef({ status: i18nText("ui.literals.kae9f5265e65f", { value0: DEFAULT_CENTER.label }), accuracy: null, time: 0 });
  const headingUiRef = useRef({ heading: null, time: 0 });
  const navigationDragRef = useRef(null);
  // Live-ETA state kept in refs so the GPS watcher can update the direction
  // card without re-subscribing the watch on every render.
  const liveSpeedRef = useRef(0);
  const lastMovingSpeedRef = useRef(0);
  const hasStartedMovingRef = useRef(false);
  const lastProgressUiAtRef = useRef(0);
  const mapEverLoadedRef = useRef(false);
  // When true, the camera keeps the traveller pinned to the viewport centre and
  // the map slides underneath. A manual pan releases the lock; the recenter
  // button (recenterSignal) re-engages it.
  const followLockRef = useRef(true);
  // Tracks whether the marker is currently snapped to the route line, so the
  // snap can be released with hysteresis rather than flickering.
  const routeSnappedRef = useRef(false);

  const [locationStatus, setLocationStatus] = useState(() => t("urride.areaMap.gpsShowing", { area: DEFAULT_CENTER.label }));
  const [deviceLocationState, setDeviceLocationState] = useState("checking");
  const [userLocation, setUserLocation] = useState(null);
  const [routeInfo, setRouteInfo] = useState(null);
  const [routeError, setRouteError] = useState("");
  const [routeLoading, setRouteLoading] = useState(false);
  const [routeStatusKey, setRouteStatusKey] = useState("correct");
  const [gpsAccuracy, setGpsAccuracy] = useState(null);
  const [navigationSnap, setNavigationSnap] = useState("half");
  const [headingMode, setHeadingMode] = useState("smart");
  const [heading, setHeading] = useState(null);
  const [weather, setWeather] = useState(null);
  const [weatherError, setWeatherError] = useState("");
  const [trafficInsight, setTrafficInsight] = useState(() => getTrafficLevel(null, "correct"));
  const [trafficAhead, setTrafficAhead] = useState(null);
  const [alternativeRoute, setAlternativeRoute] = useState(null);
  const [alternativeLoading, setAlternativeLoading] = useState(false);
  const [alternativeError, setAlternativeError] = useState("");
  const [rerouteKey, setRerouteKey] = useState(0);
  // Base-map render state. `mapTilesLoading` covers the normal "still fetching
  // tiles" case; `mapBlocked` is set to "offline" | "slow" when the base map
  // cannot draw because of the connection, so the overlay can explain it and
  // offer a retry.
  const [mapTilesLoading, setMapTilesLoading] = useState(true);
  const [mapBlocked, setMapBlocked] = useState("");
  const [mapReloadKey, setMapReloadKey] = useState(0);

  const routeStatus = {
    ...ROUTE_STATUS[routeStatusKey],
    label: t(ROUTE_STATUS_LABEL_KEYS[routeStatusKey] || ROUTE_STATUS_LABEL_KEYS.correct),
    message: t(ROUTE_STATUS_MSG_KEYS[routeStatusKey] || ROUTE_STATUS_MSG_KEYS.correct),
  };
  const routeStatusPill = t(ROUTE_STATUS_PILL_KEYS[routeStatusKey] || ROUTE_STATUS_PILL_KEYS.correct);
  const showNavigationCard = Boolean(routeLoading || routeInfo || routeError);
  const navigationCollapsed = navigationSnap === "collapsed";
  const routeDistanceLabel = routeInfo?.distance || (routeLoading ? t("urride.areaMap.findingRoute") : t("urride.areaMap.routeWord"));
  const routeDurationLabel = routeInfo?.duration || (routeError ? t("urride.areaMap.checkRoute") : "");
  const routeSummaryLabel = routeDurationLabel ? `${routeDistanceLabel} - ${routeDurationLabel}` : routeDistanceLabel;
  const routeFromLabel = routeInfo?.from || t("urride.areaMap.currentLocation");
  const routePickupLabel = routeInfo?.pickup || routePlan?.pickup?.address || routePlan?.pickup?.name || "";
  const routeToLabel = routeInfo?.to || routePlan?.dropoff?.address || selectedLocation?.name || selectedLocation?.label || t("urride.areaMap.selectedLocationLc");
  const operatorPickup = normalizeRoutePreviewPoint(routePlan?.pickup);
  const operatorDropoff = normalizeRoutePreviewPoint(routePlan?.dropoff);
  const hasOperatorRoutePlan = Boolean(operatorPickup && operatorDropoff);
  const canUseHeading = headingMode !== "north";
  const weatherInsight = getSmartWeatherMessage(weather);
  const showWeatherBadge = Boolean(weatherError || weatherInsight.relevant);

  useEffect(() => {
    onMapInteractionStartRef.current = onMapInteractionStart;
  }, [onMapInteractionStart]);

  useEffect(() => {
    onMapInteractionEndRef.current = onMapInteractionEnd;
  }, [onMapInteractionEnd]);

  // Picking a search result should not cover the map: the direction card
  // opens collapsed to its summary pill, and the user expands it when needed.
  // The ref keeps that intent alive while the route loads and resolves, since
  // those steps normally snap the card to half-open. Operator route previews
  // (routePlan) keep the regular half-open behavior.
  const collapseForSearchSelectionRef = useRef(false);
  useEffect(() => {
    if (selectedLocation && !routePlan) {
      collapseForSearchSelectionRef.current = true;
      setNavigationSnap("collapsed");
    } else {
      collapseForSearchSelectionRef.current = false;
    }
    // routePlan presence only decides whether the collapse intent applies.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedLocation]);

  function snapForRouteUpdate() {
    return collapseForSearchSelectionRef.current ? "collapsed" : "half";
  }

  function setNextNavigationSnap(direction) {
    // A manual snap change means the user chose a size; stop forcing the
    // search-selection collapse on later route updates.
    collapseForSearchSelectionRef.current = false;
    const snaps = ["collapsed", "half", "expanded"];
    setNavigationSnap((current) => {
      const index = Math.max(0, snaps.indexOf(current));
      const nextIndex = direction === "up"
        ? Math.min(snaps.length - 1, index + 1)
        : Math.max(0, index - 1);
      return snaps[nextIndex];
    });
  }

  function handleNavigationDragStart(event) {
    if (!showNavigationCard) return;
    navigationDragRef.current = {
      pointerId: event.pointerId,
      startY: event.clientY,
    };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }

  function handleNavigationDragEnd(event) {
    const drag = navigationDragRef.current;
    navigationDragRef.current = null;
    if (!drag) return;

    event.currentTarget.releasePointerCapture?.(drag.pointerId);
    const deltaY = event.clientY - drag.startY;
    if (Math.abs(deltaY) < 34) return;

    setNextNavigationSnap(deltaY < 0 ? "up" : "down");
  }

  function publishGpsUi(status, accuracy, options = {}) {
    const now = performance.now();
    const previous = gpsUiRef.current;
    const nextAccuracy = accuracy == null ? null : Math.round(accuracy);
    const statusChanged = Boolean(status && status !== previous.status);
    const accuracyChanged =
      nextAccuracy !== previous.accuracy &&
      Math.abs(Number(nextAccuracy || 0) - Number(previous.accuracy || 0)) >= GPS_SETTINGS.gpsUiAccuracyDeltaMeters;

    if (!options.force && !statusChanged && !accuracyChanged && now - previous.time < GPS_SETTINGS.gpsUiThrottleMs) {
      return;
    }

    gpsUiRef.current = {
      status: status || previous.status,
      accuracy: nextAccuracy,
      time: now,
    };

    if (status && status !== previous.status) setLocationStatus(status);
    if (nextAccuracy !== previous.accuracy) setGpsAccuracy(nextAccuracy);
  }

  function publishHeadingUi(nextHeading) {
    const normalizedHeading = normalizeBearing(nextHeading);
    if (normalizedHeading == null) return;

    const now = performance.now();
    const previous = headingUiRef.current;
    const changedEnough =
      previous.heading == null ||
      Math.abs(normalizedHeading - previous.heading) >= GPS_SETTINGS.headingUiDeltaDegrees;

    headingRef.current = normalizedHeading;

    if (!changedEnough && now - previous.time < GPS_SETTINGS.headingUiThrottleMs) return;

    headingUiRef.current = { heading: normalizedHeading, time: now };
    setHeading(Math.round(normalizedHeading));
  }

  function publishLocationToParent(position, options = {}) {
    if (!position?.lat || !position?.lng) return;

    const now = Date.now();
    const previous = lastParentLocationRef.current;
    const movedMeters = previous ? distanceInMeters(previous, position) : Infinity;
    const waitedTooLong = now - lastParentLocationAtRef.current >= GPS_SETTINGS.parentPublishMaxMs;

    if (!options.force && previous && movedMeters < GPS_SETTINGS.parentPublishMeters && !waitedTooLong) return;

    lastParentLocationRef.current = position;
    lastParentLocationAtRef.current = now;
    onLocationResolved?.(position);
  }

  // Rewrites the direction card's distance + ETA as the traveller moves. The
  // ETA only appears once movement has been detected, and both values count
  // down toward the destination. Throttled so the card is not rewritten on
  // every GPS tick.
  function publishLiveRouteProgress(remainingMeters) {
    if (arrivalReachedRef.current || !Number.isFinite(remainingMeters)) return;

    const now = performance.now();
    if (now - lastProgressUiAtRef.current < NAV_MOVEMENT_SETTINGS.progressUiThrottleMs) return;
    lastProgressUiAtRef.current = now;

    const moving = liveSpeedRef.current >= NAV_MOVEMENT_SETTINGS.movingSpeedMps;
    if (moving) hasStartedMovingRef.current = true;

    // Once the trip is underway, use the last confident moving speed so the ETA
    // stays steady through short stops (traffic lights, junctions) instead of
    // jumping around.
    const etaSpeed = Math.max(lastMovingSpeedRef.current, NAV_MOVEMENT_SETTINGS.minEtaSpeedMps);
    const etaSeconds = hasStartedMovingRef.current ? remainingMeters / etaSpeed : null;
    const nextDistance = formatDistance(Math.max(0, remainingMeters));
    const nextDuration = etaSeconds != null ? formatDuration(etaSeconds) : t("urride.areaMap.etaPlaceholder");

    setRouteInfo((current) => {
      if (!current || current.routePlan) return current;
      if (current.distance === nextDistance && current.duration === nextDuration) return current;
      return { ...current, distance: nextDistance, duration: nextDuration, remainingMeters };
    });
  }

  function getCameraBearing(position, destination, routeSegmentIndex = lastRouteSegmentIndexRef.current) {
    if (headingMode === "north") return 0;

    if (headingMode === "compass" && headingRef.current != null) {
      return headingRef.current;
    }

    const routeBearing = getNextRouteBearing(position, routeCoordinatesRef.current, routeSegmentIndex);
    if (routeBearing != null) return routeBearing;
    if (destination) return bearingBetweenPoints(position, destination);
    return headingRef.current || mapRef.current?.getBearing?.() || 0;
  }

  function applySmartCamera(position, destination = selectedLocation, routeSegmentIndex, options = {}) {
    const map = mapRef.current;
    if (!map || !position || !smartCameraRef.current) return;
    if (!options.force && isUserInteractingRef.current) return;

    const now = performance.now();
    if (!options.force && now - lastCameraMoveRef.current < GPS_SETTINGS.cameraThrottleMs) return;
    lastCameraMoveRef.current = now;

    const hasDestination = Boolean(destination?.lat && destination?.lng);
    const bearing = getCameraBearing(position, destination, routeSegmentIndex);
    const cameraCenter = getSmartCameraCenter(
      position,
      destination,
      routeCoordinatesRef.current,
      routeSegmentIndex,
      headingMode,
    );

    map.easeTo({
      center: [cameraCenter.lng, cameraCenter.lat],
      zoom: Math.max(map.getZoom(), hasDestination ? 16.2 : 15.2),
      pitch: hasDestination || canUseHeading ? 58 : 35,
      bearing,
      duration: options.duration ?? (options.force ? 520 : 720),
      essential: true,
    });
  }

  // Keeps the traveller centred while moving. A single throttled easeTo per GPS
  // update slides the map centre (and eases bearing/zoom/pitch together) toward
  // the marker's target - smooth, unlike a per-frame setCenter, which stutters.
  function followTravellerCamera(target, routeSegmentIndex) {
    if (!followLockRef.current || hasOperatorRoutePlan) return;
    applySmartCamera(target, selectedLocation, routeSegmentIndex);
  }

  async function requestCompassPermissionIfNeeded() {
    try {
      const orientation = window.DeviceOrientationEvent;
      if (orientation?.requestPermission) {
        await orientation.requestPermission();
      }
    } catch (error) {
      console.warn("Compass permission request failed", error);
    }
  }

  function clearPendingReroute() {
    if (rerouteTimerRef.current) {
      window.clearTimeout(rerouteTimerRef.current);
      rerouteTimerRef.current = null;
    }
  }

  function scheduleRerouteFrom(position, distanceFromRoute) {
    if (!selectedLocation?.lat || !selectedLocation?.lng || routeLoading || arrivalReachedRef.current) return;

    const now = Date.now();
    if (rerouteTimerRef.current || now - lastRerouteAtRef.current < GPS_SETTINGS.rerouteCooldownMs) return;

    setNavigationSnap("half");
    setLocationStatus(i18nText("ui.literals.k45a626c3d212", { value0: Math.round(distanceFromRoute) }));

    rerouteTimerRef.current = window.setTimeout(() => {
      rerouteTimerRef.current = null;
      lastRerouteAtRef.current = Date.now();
      routeStartOverrideRef.current = position;
      setRouteInfo((current) =>
        current
          ? {
              ...current,
              distance: t("urride.areaMap.rerouting"),
              duration: "...",
            }
          : current,
      );
      setRerouteKey((value) => value + 1);
    }, GPS_SETTINGS.rerouteConfirmMs);
  }

  const routeCardStatus = routeError
    ? {
        label: t("urride.areaMap.routeNeedsAttention"),
        message: routeError,
        className: "bg-red-100 text-red-700",
      }
    : routeLoading
      ? {
          label: t("urride.areaMap.calculatingRoute"),
          message: t("urride.areaMap.calculatingMsg"),
          className: "bg-blue-100 text-blue-700",
        }
      : routeStatus;
  const activeTrafficInsight = trafficAhead
    ? {
        label: trafficAhead.label || t("urride.areaMap.taLabel"),
        detail: `${trafficAhead.roadName || t("urride.areaMap.taAffectedRoad")} - ${trafficAhead.detail}`,
        className: trafficAhead.status === "red" ? "bg-red-100 text-red-700" : "bg-yellow-100 text-yellow-700",
      }
    : trafficInsight;

  function publishTrafficAhead(nextTrafficAhead, options = {}) {
    const previous = trafficAheadRef.current;
    const same =
      previous?.id === nextTrafficAhead?.id &&
      previous?.status === nextTrafficAhead?.status &&
      previous?.segmentIndex === nextTrafficAhead?.segmentIndex;

    if (!options.force && same) return;

    trafficAheadRef.current = nextTrafficAhead;
    setTrafficAhead(nextTrafficAhead);

    if (nextTrafficAhead?.geometry) {
      upsertTrafficAheadRouteLayer(mapRef.current, nextTrafficAhead.geometry, nextTrafficAhead.status);
    } else if (mapRef.current?.getSource("route-traffic-ahead")) {
      upsertTrafficAheadRouteLayer(mapRef.current, null);
    }
  }

  function evaluateTrafficAhead(options = {}) {
    const now = Date.now();
    if (!options.force && now - trafficAheadCheckAtRef.current < TRAFFIC_AHEAD_SETTINGS.checkThrottleMs) {
      return trafficAheadRef.current;
    }

    trafficAheadCheckAtRef.current = now;
    const position = smoothedPositionRef.current || userLocationRef.current || markerRenderedPositionRef.current;
    const nextTrafficAhead = detectTrafficAhead({
      position,
      routeCoordinates: routeCoordinatesRef.current,
      currentSegmentIndex: lastRouteSegmentIndexRef.current,
      reports: reportLocationsRef.current,
      trafficSnapshots: trafficSnapshotsRef.current,
    });

    publishTrafficAhead(nextTrafficAhead, options);
    return nextTrafficAhead;
  }

  async function handleFindAlternativeRoute() {
    if (!selectedLocation?.lat || !selectedLocation?.lng || !mapRef.current) return;

    const requestId = alternativeRouteRequestRef.current + 1;
    alternativeRouteRequestRef.current = requestId;
    const start = smoothedPositionRef.current || userLocationRef.current || markerRenderedPositionRef.current || DEFAULT_CENTER;

    setAlternativeLoading(true);
    setAlternativeError("");

    try {
      const route = hasOperatorRoutePlan
        ? await getRouteThroughPoints([start, operatorPickup, operatorDropoff])
        : await getRouteBetweenPoints(start, selectedLocation);
      if (alternativeRouteRequestRef.current !== requestId) return;

      const routeTrafficAhead = detectTrafficAhead({
        position: start,
        routeCoordinates: route.geometry?.coordinates || [],
        currentSegmentIndex: 0,
        reports: reportLocationsRef.current,
        trafficSnapshots: trafficSnapshotsRef.current,
      });
      const nextAlternative = {
        route,
        avoidsIssue: !routeTrafficAhead,
        trafficAhead: routeTrafficAhead,
        distance: formatDistance(route.distanceMeters),
        duration: formatDuration(route.durationSeconds),
      };

      alternativeRouteRef.current = nextAlternative;
      setAlternativeRoute(nextAlternative);
      await waitForMapStyle(mapRef.current);
      upsertAlternativeRouteLayer(mapRef.current, route.geometry);
    } catch {
      if (alternativeRouteRequestRef.current !== requestId) return;
      setAlternativeError(t("urride.areaMap.altUnavailable"));
      showToast(t("urride.areaMap.altToast"), "warning", {
        title: t("urride.areaMap.altToastTitle"),
      });
      clearAlternativeRouteLayer(mapRef.current);
    } finally {
      if (alternativeRouteRequestRef.current === requestId) {
        setAlternativeLoading(false);
      }
    }
  }

  function handleUseAlternativeRoute() {
    const nextAlternative = alternativeRouteRef.current || alternativeRoute;
    const route = nextAlternative?.route;
    if (!route?.geometry || !mapRef.current) return;

    routeCoordinatesRef.current = route.geometry.coordinates || [];
    originalRouteRef.current = route;
    routeStatusRef.current = "correct";
    setRouteStatusKey("correct");
    upsertRouteLayers(mapRef.current, route.geometry, ROUTE_STATUS.correct.color);
    clearAlternativeRouteLayer(mapRef.current);
    setAlternativeRoute(null);
    alternativeRouteRef.current = null;
    setAlternativeError("");
    setRouteInfo({
      from: userLocationRef.current ? t("urride.areaMap.fromCurrentLocation") : DEFAULT_CENTER.label,
      to: selectedLocation.name,
      distance: formatDistance(route.distanceMeters),
      duration: formatDuration(route.durationSeconds),
      raw: route,
    });
    setNavigationSnap(snapForRouteUpdate());
    setTrafficInsight(getLiveTrafficInsight(trafficSnapshotsRef.current, route, "correct"));
    evaluateTrafficAhead({ force: true });
  }

  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: getInitialMapStyle(),
      center: [DEFAULT_CENTER.lng, DEFAULT_CENTER.lat],
      zoom: 13,
      pitch: 35,
      bearing: 0,
      attributionControl: true,
      maxZoom: 20,
      fadeDuration: 0,
    });

    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "bottom-right");
    map.addControl(new maplibregl.ScaleControl({ maxWidth: 110, unit: "metric" }), "bottom-left");

    const markUserInteractionStart = (event) => {
      if (!event?.originalEvent) return;
      if (userInteractionIdleTimerRef.current) window.clearTimeout(userInteractionIdleTimerRef.current);
      isUserInteractingRef.current = true;
      // A manual pan means the traveller wants to look around: release the
      // centre-lock until they tap recenter. Zoom/rotate/pitch keep following.
      if (event.type === "dragstart") followLockRef.current = false;
      onMapInteractionStartRef.current?.({ type: event.type });
    };

    const markUserInteractionEnd = (event) => {
      if (userInteractionIdleTimerRef.current) window.clearTimeout(userInteractionIdleTimerRef.current);
      const center = map.getCenter?.();
      if (center) {
        onMapInteractionEndRef.current?.({
          center: { lat: center.lat, lng: center.lng },
          type: event?.type || "interactionend",
        });
      }
      userInteractionIdleTimerRef.current = window.setTimeout(() => {
        isUserInteractingRef.current = false;
        userInteractionIdleTimerRef.current = null;
      }, 750);
    };

    map.on("dragstart", markUserInteractionStart);
    map.on("zoomstart", markUserInteractionStart);
    map.on("rotatestart", markUserInteractionStart);
    map.on("pitchstart", markUserInteractionStart);
    map.on("dragend", markUserInteractionEnd);
    map.on("zoomend", markUserInteractionEnd);
    map.on("rotateend", markUserInteractionEnd);
    map.on("pitchend", markUserInteractionEnd);

    const handleMapLoad = () => {
      mapEverLoadedRef.current = true;
      if (map.areTilesLoaded?.()) {
        setMapTilesLoading(false);
        setMapBlocked("");
      }
    };

    // `idle` fires once every visible tile for the current view has finished
    // loading and no animations are running - the reliable "map is fully
    // drawn" signal we use to clear the loading overlay.
    const handleMapIdle = () => {
      if (map.areTilesLoaded?.()) {
        mapEverLoadedRef.current = true;
        setMapTilesLoading(false);
        setMapBlocked("");
      }
    };

    const handleMapError = (event) => {
      // First choice: silently fall back from a failed MapTiler style to the
      // free OpenStreetMap raster tiles.
      if (MAPTILER_KEY && isMapTilerRequestError(event) && !map.getSource("osm-tiles")) {
        console.warn("MapTiler style could not load. Falling back to OpenStreetMap raster tiles.", event?.error);
        map.setStyle(osmRasterStyle);
        return;
      }

      // Otherwise, if tiles are failing because of the connection and the base
      // map has never managed to draw, surface a recoverable overlay. A map
      // that has already drawn keeps its partial view (MapLibre retries tiles
      // on the next move) rather than being hidden behind a full overlay.
      if (isTileNetworkError(event) && !mapEverLoadedRef.current) {
        setMapTilesLoading(false);
        setMapBlocked(getNetworkStatus().online ? "slow" : "offline");
      }
    };

    map.on("load", handleMapLoad);
    map.on("idle", handleMapIdle);
    map.on("error", handleMapError);

    mapRef.current = map;
    onMapReady?.(map);

    userMarkerRef.current = new maplibregl.Marker({
      element: createLiveUserMarker(),
      anchor: "center",
    })
      .setLngLat([DEFAULT_CENTER.lng, DEFAULT_CENTER.lat])
      .addTo(map);
    markerRenderedPositionRef.current = DEFAULT_CENTER;

    const operatorAnimations = operatorAnimationCancelRef.current;
    const operatorMarkers = operatorMarkersRef.current;
    const areaLocationMarkers = areaLocationMarkersRef.current;
    const reportMarkers = reportMarkersRef.current;
    const trafficMarkers = trafficMarkersRef.current;

    return () => {
      map.off("dragstart", markUserInteractionStart);
      map.off("zoomstart", markUserInteractionStart);
      map.off("rotatestart", markUserInteractionStart);
      map.off("pitchstart", markUserInteractionStart);
      map.off("dragend", markUserInteractionEnd);
      map.off("zoomend", markUserInteractionEnd);
      map.off("rotateend", markUserInteractionEnd);
      map.off("pitchend", markUserInteractionEnd);
      map.off("load", handleMapLoad);
      map.off("idle", handleMapIdle);
      map.off("error", handleMapError);
      if (userInteractionIdleTimerRef.current) window.clearTimeout(userInteractionIdleTimerRef.current);
      markerAnimationCancelRef.current?.();
      operatorAnimations.forEach((cancel) => cancel?.());
      operatorAnimations.clear();
      if (rerouteTimerRef.current) window.clearTimeout(rerouteTimerRef.current);

      if (watchIdRef.current !== null) navigator.geolocation.clearWatch(watchIdRef.current);

      operatorMarkers.forEach((marker) => marker.remove());
      operatorMarkers.clear();
      areaLocationMarkers.forEach((marker) => marker.remove());
      areaLocationMarkers.clear();
      reportMarkers.forEach((marker) => marker.remove());
      reportMarkers.clear();
      trafficMarkers.forEach((marker) => marker.remove());
      trafficMarkers.clear();

      userMarkerRef.current?.remove();
      pickupMarkerRef.current?.remove();
      destinationMarkerRef.current?.remove();
      measurementStartMarkerRef.current?.remove();
      measurementEndMarkerRef.current?.remove();
      measurementLabelMarkerRef.current?.remove();

      clearRouteLayers(map);
      clearMeasurementPreviewLayer(map);
      clearTrafficOverlayLayers(map);
      clearTrafficAheadRouteLayer(map);
      clearAlternativeRouteLayer(map);

      map.remove();
      mapRef.current = null;
      userMarkerRef.current = null;
      pickupMarkerRef.current = null;
      destinationMarkerRef.current = null;
      measurementStartMarkerRef.current = null;
      measurementEndMarkerRef.current = null;
      measurementLabelMarkerRef.current = null;
      watchIdRef.current = null;
      markerRenderedPositionRef.current = null;
    };
  }, [onMapReady]);

  // Manual/automatic base-map recovery: re-applies the map style so tiles are
  // re-fetched. Runs when the user taps "Retry map" or when the connection is
  // restored while the map was blocked.
  useEffect(() => {
    if (mapReloadKey === 0) return;
    const map = mapRef.current;
    if (!map) return;

    setMapBlocked("");
    setMapTilesLoading(true);
    try {
      map.setStyle(getInitialMapStyle());
    } catch (error) {
      console.warn("Map reload failed", error);
    }
    // A safety net: if tiles still have not drawn shortly after a reload, keep
    // the overlay honest about the connection instead of spinning forever.
    const timer = window.setTimeout(() => {
      if (!map.areTilesLoaded?.()) {
        setMapTilesLoading(false);
        setMapBlocked(getNetworkStatus().online ? "slow" : "offline");
      }
    }, 9000);
    return () => window.clearTimeout(timer);
  }, [mapReloadKey]);

  // Keep the base-map overlay in step with the live connection: drop straight
  // into the offline state when the device goes offline before tiles are
  // ready, and auto-retry once it is back.
  useEffect(() => {
    return subscribeToNetworkStatus((status) => {
      if (!status.online) {
        if (!mapEverLoadedRef.current) {
          setMapTilesLoading(false);
          setMapBlocked("offline");
        }
        return;
      }
      setMapBlocked((current) => {
        if (current) setMapReloadKey((value) => value + 1);
        return current;
      });
    });
  }, []);

  useEffect(() => {
    function handleOrientation(event) {
      const rawHeading =
        typeof event.webkitCompassHeading === "number"
          ? event.webkitCompassHeading
          : typeof event.alpha === "number"
            ? 360 - event.alpha
            : null;

      const nextHeading = normalizeBearing(rawHeading);
      if (nextHeading == null) return;

      publishHeadingUi(nextHeading);

      if (headingMode === "compass" && userLocationRef.current && !routeCoordinatesRef.current.length) {
        applySmartCamera(userLocationRef.current, null);
      }
    }

    async function startCompass() {
      try {
        const orientation = window.DeviceOrientationEvent;
        if (orientation?.requestPermission) {
          const permission = await orientation.requestPermission();
          if (permission !== "granted") return;
        }

        window.addEventListener("deviceorientation", handleOrientation, true);
      } catch (error) {
        console.warn("Compass heading is not available on this device.", error);
      }
    }

    if (headingMode !== "north") startCompass();

    return () => {
      window.removeEventListener("deviceorientation", handleOrientation, true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- camera helpers read live refs so compass listeners do not churn while dragging.
  }, [headingMode]);

  useEffect(() => {
    if (!navigator.geolocation) {
      setDeviceLocationState("unavailable");
      publishGpsUi(i18nText("ui.literals.kae9f5265e65f", { value0: DEFAULT_CENTER.label }), null, { force: true });
      setUserLocation(DEFAULT_CENTER);
      userLocationRef.current = DEFAULT_CENTER;
      smoothedPositionRef.current = DEFAULT_CENTER;
      markerRenderedPositionRef.current = DEFAULT_CENTER;
      lastRawPositionRef.current = DEFAULT_CENTER;
      lastRawTimestampRef.current = Date.now();
      return;
    }

    publishGpsUi(t("urride.areaMap.gpsChecking"), null, { force: true });

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setDeviceLocationState("ready");
        const accuracy = Math.round(position.coords.accuracy || 0);
        const nextCenter = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          label: t("urride.areaMap.gpsYourArea"),
          accuracy,
        };

        publishGpsUi(t("urride.areaMap.gpsUsingArea"), accuracy, { force: true });
        setUserLocation(nextCenter);
        userLocationRef.current = nextCenter;
        smoothedPositionRef.current = nextCenter;
        markerRenderedPositionRef.current = nextCenter;
        lastRawPositionRef.current = nextCenter;
        lastRawTimestampRef.current = Date.now();
        publishLocationToParent(nextCenter, { force: true });
        mapRef.current?.easeTo({
          center: [nextCenter.lng, nextCenter.lat],
          zoom: 15,
          duration: 520,
          essential: true,
        });

        userMarkerRef.current?.setLngLat([nextCenter.lng, nextCenter.lat]);
      },
      () => {
        setDeviceLocationState("unavailable");
        publishGpsUi(t("urride.areaMap.gpsShowing", { area: DEFAULT_CENTER.label }), null, { force: true });
        setUserLocation(DEFAULT_CENTER);
        userLocationRef.current = DEFAULT_CENTER;
        smoothedPositionRef.current = DEFAULT_CENTER;
        markerRenderedPositionRef.current = DEFAULT_CENTER;
        lastRawPositionRef.current = DEFAULT_CENTER;
        lastRawTimestampRef.current = Date.now();
        publishLocationToParent(DEFAULT_CENTER, { force: true });
      },
      {
        enableHighAccuracy: true,
        timeout: 8000,
        maximumAge: 60000,
      },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps -- initial geolocation publishes through refs; rerunning on every helper recreation would duplicate GPS work.
  }, [onLocationResolved]);

  useEffect(() => {
    const current = markerRenderedPositionRef.current || smoothedPositionRef.current || userLocation || DEFAULT_CENTER;

    // Tapping recenter re-locks the camera to the traveller.
    followLockRef.current = true;
    applySmartCamera(current, selectedLocation, lastRouteSegmentIndexRef.current, { force: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- recenter should run only when the user taps the recenter button.
  }, [recenterSignal]);

  useEffect(() => {
    routeInfoRef.current = routeInfo;
  }, [routeInfo]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return undefined;

    const origin = normalizeRoutePreviewPoint(measurementPreview?.origin);
    const destination = normalizeRoutePreviewPoint(measurementPreview?.destination);

    measurementStartMarkerRef.current?.remove();
    measurementEndMarkerRef.current?.remove();
    measurementLabelMarkerRef.current?.remove();
    measurementStartMarkerRef.current = null;
    measurementEndMarkerRef.current = null;
    measurementLabelMarkerRef.current = null;

    if (!origin || !destination) {
      clearMeasurementPreviewLayer(map);
      return undefined;
    }

    let cancelled = false;
    const previewCoordinates = getMeasurementPreviewCoordinates(origin, destination, measurementPreview?.geometry);
    const midpoint = getCoordinateMidpoint(previewCoordinates, {
      lat: (origin.lat + destination.lat) / 2,
      lng: (origin.lng + destination.lng) / 2,
    });

    setRouteInfo(null);
    setRouteError("");
    setRouteLoading(false);
    routeCoordinatesRef.current = [];
    clearRouteLayers(map);
    clearAlternativeRouteLayer(map);
    publishTrafficAhead(null, { force: true });

    waitForMapStyle(map).then(() => {
      if (cancelled) return;

      upsertMeasurementPreviewLayer(map, previewCoordinates);

      measurementStartMarkerRef.current = new maplibregl.Marker({
        element: createLabeledMarker("START", "#16a34a"),
        anchor: "center",
      })
        .setLngLat([origin.lng, origin.lat])
        .addTo(map);

      measurementEndMarkerRef.current = new maplibregl.Marker({
        element: createLabeledMarker("1 KM POINT", "#2563eb"),
        anchor: "center",
      })
        .setLngLat([destination.lng, destination.lat])
        .addTo(map);

      measurementLabelMarkerRef.current = new maplibregl.Marker({
        element: createMeasurementLabel(measurementPreview?.label || "1 KM"),
        anchor: "center",
      })
        .setLngLat([midpoint.lng, midpoint.lat])
        .addTo(map);

      const bounds = new maplibregl.LngLatBounds();
      previewCoordinates.forEach((coordinate) => bounds.extend(coordinate));
      bounds.extend([origin.lng, origin.lat]);
      bounds.extend([destination.lng, destination.lat]);

      map.fitBounds(bounds, {
        padding: { top: 150, bottom: 190, left: 70, right: 70 },
        duration: 900,
        maxZoom: 16.8,
      });
    });

    return () => {
      cancelled = true;
      measurementStartMarkerRef.current?.remove();
      measurementEndMarkerRef.current?.remove();
      measurementLabelMarkerRef.current?.remove();
      measurementStartMarkerRef.current = null;
      measurementEndMarkerRef.current = null;
      measurementLabelMarkerRef.current = null;
      clearMeasurementPreviewLayer(map);
    };
  }, [measurementPreview]);

  useEffect(() => {
    trafficSnapshotsRef.current = trafficSnapshots;
    setTrafficInsight((current) => {
      const next = getLiveTrafficInsight(trafficSnapshots, routeInfoRef.current?.raw || null, routeStatusRef.current);
      return next.label === current?.label && next.detail === current?.detail ? current : next;
    });
    if (routeCoordinatesRef.current.length) evaluateTrafficAhead({ force: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- traffic-ahead evaluation reads route/user refs without resubscribing map listeners.
  }, [trafficSnapshots, routeStatusKey]);

  useEffect(() => {
    let cancelled = false;
    const cameraTimers = [];

    function scheduleCameraMove(callback, delayMs) {
      const timerId = window.setTimeout(() => {
        if (!cancelled) callback();
      }, delayMs);
      cameraTimers.push(timerId);
    }

    async function drawRoute() {
      if (!selectedLocation || !mapRef.current) return;

      const routeStart =
        routeStartOverrideRef.current ||
        smoothedPositionRef.current ||
        userLocationRef.current ||
        markerRenderedPositionRef.current ||
        DEFAULT_CENTER;
      const routeTarget = operatorDropoff || selectedLocation;
      const map = mapRef.current;

      setRouteError("");
      setRouteLoading(true);
      setRouteInfo({
        from: userLocationRef.current ? t("urride.areaMap.fromCurrentLocation") : DEFAULT_CENTER.label,
        pickup: operatorPickup?.address || operatorPickup?.name,
        to: routeTarget.address || routeTarget.name || t("urride.areaMap.selectedDestination"),
        distance: t("urride.areaMap.findingRoute"),
        duration: "...",
        routePlan: hasOperatorRoutePlan,
      });
      setRouteStatusKey("correct");
      routeStatusRef.current = "correct";
      setNavigationSnap(snapForRouteUpdate());
      setAlternativeRoute(null);
      setAlternativeError("");
      alternativeRouteRef.current = null;
      clearAlternativeRouteLayer(map);
      lastRouteSegmentIndexRef.current = 0;
      arrivalReachedRef.current = false;
      // A fresh route means a fresh trip: the ETA stays hidden until the
      // traveller actually starts moving again, and the camera re-locks to
      // keep them centred.
      hasStartedMovingRef.current = false;
      lastMovingSpeedRef.current = 0;
      liveSpeedRef.current = 0;
      lastProgressUiAtRef.current = 0;
      followLockRef.current = true;
      routeSnappedRef.current = false;

      pickupMarkerRef.current?.remove();
      destinationMarkerRef.current?.remove();

      if (operatorPickup) {
        pickupMarkerRef.current = new maplibregl.Marker({
          element: createLabeledMarker(t("urride.areaMap.markerPickup"), "#059669"),
          anchor: "center",
        })
          .setLngLat([operatorPickup.lng, operatorPickup.lat])
          .addTo(map);
      }

      const destinationMarkerLabel = hasOperatorRoutePlan
        ? t("urride.areaMap.markerDropoff")
        : selectedLocation.type === "seller"
          ? t("urride.areaMap.markerStore")
          : t("urride.areaMap.markerDestination");

      destinationMarkerRef.current = new maplibregl.Marker({
        element: createLabeledMarker(destinationMarkerLabel, "#2563eb"),
        anchor: "center",
      })
        .setLngLat([routeTarget.lng, routeTarget.lat])
        .addTo(map);

      await waitForMapStyle(map);

      const route = hasOperatorRoutePlan
        ? await getRouteThroughPoints([routeStart, operatorPickup, routeTarget])
        : await getRouteBetweenPoints(routeStart, routeTarget);

      if (cancelled) return;

      routeCoordinatesRef.current = route.geometry.coordinates || [];
      originalRouteRef.current = route;

      upsertRouteLayers(map, route.geometry, ROUTE_STATUS.correct.color);

      const bounds = new maplibregl.LngLatBounds();
      route.geometry.coordinates.forEach((coord) => bounds.extend(coord));
      [routeStart, operatorPickup, routeTarget].filter(Boolean).forEach((point) => bounds.extend([point.lng, point.lat]));

      const fitRouteBounds = () => map.fitBounds(bounds, {
        padding: hasOperatorRoutePlan
          ? { top: 150, bottom: 290, left: 80, right: 80 }
          : { top: 140, bottom: 230, left: 70, right: 70 },
        duration: 900,
      });

      if (hasOperatorRoutePlan) {
        [routeStart, operatorPickup, routeTarget].filter(Boolean).forEach((point, index) => {
          scheduleCameraMove(() => {
            map.flyTo({
              center: [point.lng, point.lat],
              zoom: index === 0 ? 15 : 15.5,
              duration: 650,
              essential: true,
            });
          }, index * 760);
        });
        scheduleCameraMove(fitRouteBounds, 2450);
      } else {
        fitRouteBounds();
        window.setTimeout(() => {
          if (!cancelled) applySmartCamera(routeStart, routeTarget, 0, { force: true });
        }, 950);
      }

      setRouteInfo({
        from: userLocationRef.current ? t("urride.areaMap.fromCurrentLocation") : DEFAULT_CENTER.label,
        pickup: operatorPickup?.address || operatorPickup?.name,
        to: routeTarget.address || routeTarget.name,
        distance: formatDistance(route.distanceMeters),
        // The ETA is intentionally withheld until movement is detected: the
        // routing engine's static duration is not trustworthy for a live
        // traveller, so we compute it from real GPS speed instead.
        duration: hasOperatorRoutePlan ? formatDuration(route.durationSeconds) : t("urride.areaMap.etaPlaceholder"),
        legs: route.legs || [],
        routePlan: hasOperatorRoutePlan,
        totalMeters: route.distanceMeters,
        remainingMeters: route.distanceMeters,
        raw: route,
      });
      setTrafficInsight(getLiveTrafficInsight(trafficSnapshotsRef.current, route, "correct"));
      evaluateTrafficAhead({ force: true });
      setRouteLoading(false);
      routeStartOverrideRef.current = null;
    }

    drawRoute().catch((error) => {
      if (cancelled) return;
      routeStartOverrideRef.current = null;
      routeCoordinatesRef.current = [];
      originalRouteRef.current = null;
      publishTrafficAhead(null, { force: true });
      clearAlternativeRouteLayer(mapRef.current);
      clearRouteLayers(mapRef.current);
      setRouteLoading(false);
      setRouteStatusKey("wrong");
      routeStatusRef.current = "wrong";
      setRouteInfo({
        from: userLocationRef.current ? t("urride.areaMap.fromCurrentLocation") : DEFAULT_CENTER.label,
        pickup: operatorPickup?.address || operatorPickup?.name,
        to: operatorDropoff?.address || selectedLocation?.name || t("urride.areaMap.selectedDestination"),
        distance: t("urride.areaMap.routeUnavailable"),
        duration: t("urride.areaMap.tryAgain"),
        routePlan: hasOperatorRoutePlan,
      });
      setNavigationSnap("half");
      setRouteError(error.message || t("urride.areaMap.routeErrorFallback"));
      showToast(t("urride.areaMap.routeToastMsg"), "warning", {
        title: t("urride.areaMap.routeToastTitle"),
      });
    });

    return () => {
      cancelled = true;
      cameraTimers.forEach((timerId) => window.clearTimeout(timerId));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- route drawing is keyed by destination/reroute only; camera helpers read current refs.
  }, [deviceLocationState, routePlan, selectedLocation, rerouteKey]);

  useEffect(() => {
    if (!navigator.geolocation || !mapRef.current) return;

    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }

    watchIdRef.current = navigator.geolocation.watchPosition(
      (position) => {
        setDeviceLocationState("ready");
        const accuracy = Math.round(position.coords.accuracy || 0);

        if (accuracy > GPS_SETTINGS.ignoreAccuracyAboveMeters) {
          publishGpsUi(t("urride.areaMap.gpsWeak", { m: accuracy }), accuracy);
          return;
        }

        const rawLivePosition = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          label: t("urride.areaMap.liveCurrentLocation"),
          accuracy,
          heading: position.coords.heading,
          speed: position.coords.speed,
        };

        const gpsHeading = normalizeBearing(position.coords.heading);
        if (gpsHeading != null && position.coords.speed != null && position.coords.speed > 0.7) {
          publishHeadingUi(gpsHeading);
        }

        const previousRawPosition = lastRawPositionRef.current;
        const previousRawTimestamp = lastRawTimestampRef.current;
        const now = Date.now();
        const elapsedMs = previousRawTimestamp ? now - previousRawTimestamp : 1000;

        if (previousRawPosition && previousRawTimestamp) {
          const rawDistance = distanceInMeters(previousRawPosition, rawLivePosition);
          const seconds = Math.max(elapsedMs / 1000, 1);
          const rawSpeed = rawDistance / seconds;

          if (
            rawDistance > GPS_SETTINGS.jumpDistanceMeters &&
            rawSpeed > GPS_SETTINGS.maxHumanSpeedMetersPerSecond
          ) {
            publishGpsUi(t("urride.areaMap.gpsJump", { m: accuracy }), accuracy);
            return;
          }
        }

        // Live speed estimate that powers the ETA. Prefer the device's own
        // speed reading; fall back to distance-over-time between GPS fixes.
        const speedSeconds = Math.max(elapsedMs / 1000, 0.5);
        const reportedSpeed = Number(position.coords.speed);
        const derivedSpeed = previousRawPosition
          ? distanceInMeters(previousRawPosition, rawLivePosition) / speedSeconds
          : 0;
        const instantSpeed = Number.isFinite(reportedSpeed) && reportedSpeed >= 0 ? reportedSpeed : derivedSpeed;
        liveSpeedRef.current = liveSpeedRef.current > 0
          ? lerp(liveSpeedRef.current, instantSpeed, NAV_MOVEMENT_SETTINGS.speedSmoothing)
          : instantSpeed;
        if (liveSpeedRef.current >= NAV_MOVEMENT_SETTINGS.movingSpeedMps) {
          lastMovingSpeedRef.current = liveSpeedRef.current;
        }

        lastRawPositionRef.current = rawLivePosition;
        lastRawTimestampRef.current = now;

        const previousSmoothedPosition = smoothedPositionRef.current || userLocationRef.current || DEFAULT_CENTER;
        const livePosition = getSmoothedPosition(previousSmoothedPosition, rawLivePosition, elapsedMs);
        const movedMeters = distanceInMeters(previousSmoothedPosition, livePosition);

        if (movedMeters <= GPS_SETTINGS.ignoreTinyMoveMeters) {
          publishGpsUi(null, accuracy);
          return;
        }

        publishGpsUi(
          accuracy > GPS_SETTINGS.lowAccuracyWarningMeters
            ? t("urride.areaMap.gpsLow", { m: accuracy })
            : t("urride.areaMap.gpsLive"),
          accuracy,
        );
        userLocationRef.current = livePosition;
        publishLocationToParent(livePosition);

        // Snap the DISPLAYED marker to the route line when the traveller is on
        // it (within GPS error), so the icon rides the route instead of
        // drifting beside it. The true position still drives logic below.
        const routeCoordinates = routeCoordinatesRef.current;
        const nearestOnRoute = routeCoordinates.length
          ? getNearestPointOnRoute(livePosition, routeCoordinates)
          : null;
        const effectiveRouteDistance = nearestOnRoute
          ? Math.max(0, nearestOnRoute.distance - accuracy * NAV_SNAP_SETTINGS.accuracyDiscount)
          : Infinity;
        // Hysteresis stops the marker wobbling between the route line and the
        // raw GPS point when the fix hovers around the snap boundary: engage the
        // snap at a tight threshold, release it only once clearly off-route.
        const shouldSnapToRoute = nearestOnRoute != null && (
          effectiveRouteDistance <= NAV_SNAP_SETTINGS.snapMeters ||
          (routeSnappedRef.current && effectiveRouteDistance <= NAV_SNAP_SETTINGS.snapReleaseMeters)
        );
        routeSnappedRef.current = shouldSnapToRoute;
        const markerTarget = shouldSnapToRoute
          ? { ...livePosition, lat: nearestOnRoute.point.lat, lng: nearestOnRoute.point.lng }
          : livePosition;

        const markerStartPosition =
          markerRenderedPositionRef.current ||
          getMarkerPosition(userMarkerRef.current, previousSmoothedPosition) ||
          previousSmoothedPosition;

        markerAnimationCancelRef.current?.();
        markerAnimationCancelRef.current = animateMarkerTo(
          userMarkerRef.current,
          markerStartPosition,
          markerTarget,
          GPS_SETTINGS.animationMs,
          (renderedPosition) => {
            markerRenderedPositionRef.current = renderedPosition;
          },
        );

        smoothedPositionRef.current = livePosition;

        // Smoothly re-centre the map on the marker's target (throttled easeTo),
        // keeping the traveller centred while the map glides underneath.
        if (!isUserInteractingRef.current) {
          followTravellerCamera(markerTarget, nearestOnRoute?.segmentIndex);
        }

        if (routeCoordinates.length) {
          const nearestRouteInfo = {
            distance: nearestOnRoute?.distance ?? Infinity,
            segmentIndex: nearestOnRoute?.segmentIndex ?? 0,
          };
          const distanceToDestination = selectedLocation?.lat
            ? distanceInMeters(livePosition, selectedLocation)
            : Infinity;

          if (distanceToDestination <= GPS_SETTINGS.arrivalMeters && !arrivalReachedRef.current) {
            arrivalReachedRef.current = true;
            clearPendingReroute();
            publishTrafficAhead(null, { force: true });
            routeStatusRef.current = "correct";
            setRouteStatusKey("correct");
            setRouteLineColor(mapRef.current, ROUTE_STATUS.correct.color);
            setLocationStatus(t("urride.areaMap.gpsArrived"));
            setNavigationSnap("half");
            setRouteInfo((current) =>
              current
                ? {
                    ...current,
                    distance: "0 m",
                    duration: t("urride.areaMap.arrived"),
                  }
                : current,
            );
            return;
          }

          // Count the remaining distance and ETA down as the traveller
          // progresses along the drawn route.
          const remainingMeters = getRemainingRouteMeters(
            livePosition,
            routeCoordinatesRef.current,
            nearestRouteInfo.segmentIndex,
          );
          publishLiveRouteProgress(remainingMeters);

          const isMovingBackward =
            nearestRouteInfo.segmentIndex + GPS_SETTINGS.progressBacktrackSegments <
            lastRouteSegmentIndexRef.current;

          if (!isMovingBackward) {
            lastRouteSegmentIndexRef.current = Math.max(
              lastRouteSegmentIndexRef.current,
              nearestRouteInfo.segmentIndex,
            );
          }

          // Judge "off route" on the GPS-uncertainty-discounted distance so a
          // noisy fix on the exact route is not wrongly flagged as off-route.
          const nextStatusKey = getRouteStatus(effectiveRouteDistance, isMovingBackward);

          if (nextStatusKey !== routeStatusRef.current) {
            routeStatusRef.current = nextStatusKey;
            setRouteStatusKey(nextStatusKey);

            if (nextStatusKey === "warning" || nextStatusKey === "wrong") {
              setNavigationSnap("half");
            }
          }

          if (nextStatusKey === "correct" || effectiveRouteDistance <= GPS_SETTINGS.warningRouteMeters) {
            clearPendingReroute();
          } else if (effectiveRouteDistance >= GPS_SETTINGS.rerouteRouteMeters) {
            scheduleRerouteFrom(livePosition, effectiveRouteDistance);
          }

          setRouteLineColor(mapRef.current, ROUTE_STATUS[nextStatusKey].color);
          if (nextStatusKey === "correct") {
            setNavigationSnap("collapsed");
          } else {
            setNavigationSnap("half");
          }
          setTrafficInsight((current) => {
            const next = getLiveTrafficInsight(
              trafficSnapshotsRef.current,
              routeInfoRef.current?.raw || null,
              nextStatusKey,
            );
            return next.label === current?.label ? current : next;
          });
          evaluateTrafficAhead();
          // Centring already ran above via followTravellerCamera using this
          // frame's marker target, so no extra camera nudge is needed here.
        }
      },
      () => {
        setDeviceLocationState((current) => current === "ready" ? current : "unavailable");
        publishGpsUi(t("urride.areaMap.gpsPermission"), null, { force: true });
      },
      {
        enableHighAccuracy: true,
        maximumAge: 2000,
        timeout: 12000,
      },
    );

    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the GPS watcher stays stable except when user-facing navigation modes change.
  }, [focusMode, headingMode, onLocationResolved, routePlan, selectedLocation]);

  useEffect(() => {
    weatherCacheRef.current = weatherCache;
    if (!weatherCache) {
      setWeather(null);
      setWeatherError("");
      return;
    }
    setWeather(weatherCache);
    setWeatherError("");
  }, [weatherCache]);

  useEffect(() => {
    if (!mapRef.current) return;

    const map = mapRef.current;
    const nextIds = new Set(operatorLocations.map((operator) => operator.id));

    operatorMarkersRef.current.forEach((marker, id) => {
      if (!nextIds.has(id)) {
        operatorAnimationCancelRef.current.get(id)?.();
        operatorAnimationCancelRef.current.delete(id);
        marker.remove();
        operatorMarkersRef.current.delete(id);
      }
    });

    operatorLocations.forEach((operator) => {
      if (!operator?.id || operator.lat == null || operator.lng == null) return;

      const existingMarker = operatorMarkersRef.current.get(operator.id);

      if (existingMarker) {
        const fromPosition = getMarkerPosition(existingMarker, operator);
        operatorAnimationCancelRef.current.get(operator.id)?.();
        operatorAnimationCancelRef.current.set(
          operator.id,
          animateMarkerTo(existingMarker, fromPosition, operator, 900, () => {
            updateLiveFleetOperatorMarkerElement(existingMarker.getElement(), operator);
          }),
        );
        updateLiveFleetOperatorMarkerElement(existingMarker.getElement(), operator);
        return;
      }

      const marker = new maplibregl.Marker({
        element: createLiveFleetOperatorMarker(operator),
        anchor: "center",
      })
        .setLngLat([operator.lng, operator.lat])
        .addTo(map);

      operatorMarkersRef.current.set(operator.id, marker);
    });
  }, [operatorLocations]);



  useEffect(() => {
    reportLocationsRef.current = reportLocations;
    if (routeCoordinatesRef.current.length) evaluateTrafficAhead({ force: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- route refs keep traffic-ahead checks cheap and stable.
  }, [reportLocations]);

  useEffect(() => {
    if (!mapRef.current) return;

    const map = mapRef.current;
    const nextIds = new Set(nearbyMapLocations.map((location) => location.id));

    areaLocationMarkersRef.current.forEach((marker, id) => {
      if (!nextIds.has(id)) {
        marker.remove();
        areaLocationMarkersRef.current.delete(id);
      }
    });

    nearbyMapLocations.forEach((location) => {
      if (!location?.id || location.lat == null || location.lng == null) return;

      const existingMarker = areaLocationMarkersRef.current.get(location.id);
      if (existingMarker) {
        existingMarker.setLngLat([location.lng, location.lat]);
        return;
      }

      const element = createAreaLocationMarker(location);
      element.addEventListener("click", () => onMapLocationSelect?.(location));

      const marker = new maplibregl.Marker({ element, anchor: "center" })
        .setLngLat([location.lng, location.lat])
        .addTo(map);

      areaLocationMarkersRef.current.set(location.id, marker);
    });
  }, [nearbyMapLocations, onMapLocationSelect]);

  useEffect(() => {
    if (!mapRef.current) return;

    const map = mapRef.current;
    const nextIds = new Set(reportLocations.map((report) => report.id));

    reportMarkersRef.current.forEach((marker, id) => {
      if (!nextIds.has(id)) {
        marker.remove();
        reportMarkersRef.current.delete(id);
      }
    });

    reportLocations.forEach((report) => {
      if (!report?.id || report.lat == null || report.lng == null) return;

      const existingMarker = reportMarkersRef.current.get(report.id);
      if (existingMarker) {
        existingMarker.setLngLat([report.lng, report.lat]);
        return;
      }

      const element = createSmartReportMarker(report);
      element.addEventListener("click", () => onReportSelect?.(report));

      const marker = new maplibregl.Marker({ element, anchor: "center" })
        .setLngLat([report.lng, report.lat])
        .addTo(map);

      reportMarkersRef.current.set(report.id, marker);
    });
  }, [reportLocations, onReportSelect]);

  useEffect(() => {
    if (!mapRef.current) return;

    const map = mapRef.current;
    let cancelled = false;
    const nextIds = new Set(trafficSnapshots.map((snapshot) => snapshot.id));

    trafficMarkersRef.current.forEach((marker, id) => {
      if (!nextIds.has(id)) {
        marker.remove();
        trafficMarkersRef.current.delete(id);
      }
    });

    trafficSnapshots.forEach((snapshot) => {
      if (!snapshot?.id || snapshot.lat == null || snapshot.lng == null) return;

      const existingMarker = trafficMarkersRef.current.get(snapshot.id);
      if (existingMarker) {
        existingMarker.setLngLat([snapshot.lng, snapshot.lat]);
        return;
      }

      const marker = new maplibregl.Marker({ element: createTrafficMarker(snapshot), anchor: "center" })
        .setLngLat([snapshot.lng, snapshot.lat])
        .addTo(map);

      trafficMarkersRef.current.set(snapshot.id, marker);
    });

    waitForMapStyle(map).then(() => {
      if (!cancelled) upsertTrafficOverlayLayers(map, trafficSnapshots);
    });

    return () => {
      cancelled = true;
    };
  }, [trafficSnapshots]);


  return (
    <div className="nearby-area-map absolute inset-0 bg-slate-900" style={{ touchAction: "pan-x pan-y", overscrollBehavior: "none" }}>
      <div
        ref={mapContainerRef}
        className="absolute inset-0 h-full w-full"
        style={{ touchAction: "pan-x pan-y", willChange: "transform" }}
      />
      <div className="pointer-events-none absolute inset-0 bg-slate-950/10" />

      {mapTilesLoading && !mapBlocked ? (
        <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center">
          <div className="flex items-center gap-3 rounded-full bg-white/95 px-4 py-2 text-xs font-black text-slate-700 shadow-xl">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-slate-900" />
            {t("urride.areaMap.loadingMap")}
          </div>
        </div>
      ) : null}

      {mapBlocked ? (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-slate-950/45 px-6">
          <div className="w-full max-w-xs rounded-3xl bg-white p-5 text-center shadow-2xl">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-2xl">
              {mapBlocked === "offline" ? "📴" : "🐢"}
            </div>
            <p className="text-base font-black text-slate-950">
              {mapBlocked === "offline" ? t("urride.areaMap.offline") : t("urride.areaMap.weakNetwork")}
            </p>
            <p className="mt-1 text-sm font-semibold leading-6 text-slate-500">
              {mapBlocked === "offline"
                ? t("urride.areaMap.offlineBody")
                : t("urride.areaMap.slowBody")}
            </p>
            <button
              type="button"
              onClick={() => setMapReloadKey((value) => value + 1)}
              className="kt-pressable mt-4 h-11 w-full rounded-2xl bg-slate-950 text-sm font-black text-white"
            >
              {t("urride.areaMap.retryMap")}
            </button>
          </div>
        </div>
      ) : null}

      {!focusMode && (
        <div className="pointer-events-none absolute left-3 top-28 z-10 rounded-full bg-white/90 px-3 py-1 text-xs font-black text-slate-700 shadow sm:left-5 sm:top-28">
          {locationStatus}
          {gpsAccuracy ? <span className="ml-2 text-slate-400">{i18nText("ui.literals.k1776fa32f23e")} {gpsAccuracy}m</span> : null}
        </div>
      )}

      {!focusMode && (
        <div className="absolute right-3 top-28 z-20 grid gap-2 sm:right-5">
          <button
            type="button"
            onClick={async () => {
              await requestCompassPermissionIfNeeded();
              setHeadingMode((value) => {
                if (value === "smart") return "compass";
                if (value === "compass") return "north";
                return "smart";
              });
            }}
            className="rounded-full bg-slate-950/90 px-3 py-2 text-[11px] font-black uppercase tracking-wide text-white shadow-xl"
            aria-label={t("urride.areaMap.toggleDirection")}
          >
            {headingMode === "smart" ? t("urride.areaMap.modeSmart") : headingMode === "compass" ? t("urride.areaMap.modeCompass") : t("urride.areaMap.modeNorth")}
            {heading != null && headingMode !== "north" ? <span className="ml-1 text-white/60">{heading}°</span> : null}
          </button>
        </div>
      )}

      {showNavigationCard && (
        <div
          data-snap={navigationSnap}
          className="area-route-sheet absolute z-30 rounded-3xl bg-white/95 text-slate-950 shadow-2xl backdrop-blur"
        >
          <div
            className="area-route-sheet-handle flex cursor-grab touch-none flex-col items-center px-4 pt-3 active:cursor-grabbing"
            onPointerDown={handleNavigationDragStart}
            onPointerUp={handleNavigationDragEnd}
            onPointerCancel={() => {
              navigationDragRef.current = null;
            }}
          >
            <span className="h-1.5 w-16 rounded-full bg-slate-300 shadow-sm" />
            <span className="mt-1 text-[10px] font-black uppercase tracking-wide text-slate-400">{t("urride.areaMap.drag")}</span>
          </div>

          <div className="flex items-center justify-between gap-3 px-4 pb-3 pt-1">
            <button
              type="button"
              onClick={() => setNextNavigationSnap(navigationCollapsed ? "up" : "down")}
              className="kt-pressable rounded-full bg-green-50 px-3 py-1.5 text-xs font-black uppercase tracking-wide text-green-700"
              aria-label={navigationCollapsed ? t("urride.areaMap.expandSheet") : t("urride.areaMap.collapseSheet")}
            >
              {routeInfo?.routePlan ? t("urride.areaMap.operatorRoutePreview") : t("urride.areaMap.liveNavigation")}
            </button>

            <div className="flex items-center gap-2">
              <span className={`rounded-full px-2.5 py-1 text-[11px] font-black ${routeCardStatus.className}`}>
                {routeCardStatus.label}
              </span>

              <button
                type="button"
                onClick={() => setNextNavigationSnap(navigationCollapsed ? "up" : "down")}
                className="kt-pressable flex h-12 w-12 items-center justify-center rounded-full border-2 border-slate-300 bg-white/95 text-xl font-black leading-none text-slate-950 shadow-lg backdrop-blur"
                aria-label={navigationCollapsed ? t("urride.areaMap.expandNav") : t("urride.areaMap.collapseNav")}
              >
                {navigationCollapsed ? <FiChevronUp strokeWidth={3.2} /> : <FiChevronDown strokeWidth={3.2} />}
              </button>
            </div>
          </div>

          {navigationCollapsed ? (
            <div className="flex items-center justify-between gap-3 px-4 pb-4">
              <h3 className="text-lg font-black">
                {routeSummaryLabel}
              </h3>
              <span className={`rounded-2xl px-3 py-2 text-xs font-black ${routeCardStatus.className}`}>
                {routeError ? t("urride.areaMap.pillCheck") : routeLoading ? t("urride.areaMap.pillWait") : routeStatusPill}
              </span>
            </div>
          ) : (
            <div className="area-route-sheet-body overflow-y-auto px-4 pb-4">
              <div className="mt-2 flex items-center justify-between gap-4">
                <div>
                  <h3 className="text-xl font-black sm:text-lg">
                    {routeSummaryLabel}
                  </h3>
                  <p className="mt-1 line-clamp-2 text-sm font-semibold text-slate-500">
                    {routeInfo?.routePlan ? t("urride.areaMap.roadEtaThroughRoute") : t("urride.areaMap.toLabel", { label: routeToLabel })}
                  </p>
                </div>

                <div className={`rounded-2xl px-3 py-2 text-xs font-black ${routeCardStatus.className}`}>
                  {routeError ? t("urride.areaMap.pillCheck") : routeLoading ? t("urride.areaMap.pillWait") : routeStatusPill}
                </div>
              </div>

              <p className={`mt-3 rounded-2xl px-3 py-2 text-xs font-bold ${
                routeError ? "bg-red-50 text-red-700" : "bg-slate-100 text-slate-600"
              }`}>
                {routeCardStatus.message}
              </p>

              <RouteHealthLegend activeKey={routeError || routeLoading ? "" : routeStatusKey} />

              <div className={`mt-3 grid gap-2 ${showWeatherBadge ? "sm:grid-cols-2" : ""}`}>
                {showWeatherBadge ? (
                  <div className={`rounded-2xl px-3 py-2 text-xs font-black ${weatherError ? "bg-red-50 text-red-700" : weatherInsight.className}`}>
                    <span className="block">{weatherError || weatherInsight.label}</span>
                    <span className="mt-1 block font-bold opacity-80">{weatherError || weatherInsight.detail}</span>
                  </div>
                ) : null}
                <div className={`rounded-2xl px-3 py-2 text-xs font-black ${activeTrafficInsight.className}`}>
                  <span className="block">{activeTrafficInsight.label}</span>
                  <span className="mt-1 block font-bold opacity-80">{activeTrafficInsight.detail}</span>
                </div>
              </div>

              {trafficAhead ? (
                <div className="mt-3 rounded-2xl border border-yellow-200 bg-yellow-50 px-3 py-2 text-xs font-bold text-yellow-800">
                  <span className="block font-black">{t("urride.areaMap.trafficAheadNear", { road: trafficAhead.roadName || t("urride.areaMap.taThisRoute") })}</span>
                  <span className="mt-1 block opacity-80">{trafficAhead.detail}</span>
                </div>
              ) : null}

              {routeInfo?.raw && !routeLoading ? (
                <div className="mt-3 grid gap-2">
                  <button
                    type="button"
                    onClick={handleFindAlternativeRoute}
                    disabled={alternativeLoading}
                    className="h-10 rounded-2xl border border-slate-200 bg-white px-3 text-xs font-black text-slate-800 transition hover:bg-slate-50 disabled:opacity-60"
                  >
                    {alternativeLoading ? t("urride.areaMap.findingAlt") : t("urride.areaMap.findAlt")}
                  </button>

                  {alternativeRoute ? (
                    <div className="rounded-2xl bg-slate-100 px-3 py-2 text-xs font-bold text-slate-700">
                      <div className="flex items-center justify-between gap-3">
                        <span>
                          {t("urride.areaMap.altPrefix", { distance: alternativeRoute.distance, duration: alternativeRoute.duration })}
                        </span>
                        <span className={alternativeRoute.avoidsIssue ? "text-green-700" : "text-yellow-700"}>
                          {alternativeRoute.avoidsIssue ? t("urride.areaMap.cleaner") : t("urride.areaMap.caution")}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={handleUseAlternativeRoute}
                        className="mt-2 h-9 w-full rounded-xl bg-slate-950 text-xs font-black text-white"
                      >
                        {t("urride.areaMap.useAlt")}
                      </button>
                    </div>
                  ) : null}

                  {alternativeError ? (
                    <div className="rounded-2xl bg-red-50 px-3 py-2 text-xs font-bold text-red-700">
                      {alternativeError}
                    </div>
                  ) : null}
                </div>
              ) : null}

              <div className="mt-3 grid gap-2 text-xs font-bold text-slate-600">
                <div className="flex items-center gap-2">
                  <span className="h-3 w-3 shrink-0 rounded-full bg-green-600" />
                  <span>
                    <strong className="text-slate-900">{t("urride.areaMap.currentLocationLabel")}</strong> {routeFromLabel}
                  </span>
                </div>

                {routeInfo?.routePlan && routePickupLabel ? (
                  <div className="flex items-start gap-2">
                    <span className="mt-1 h-3 w-3 shrink-0 rounded-full bg-emerald-600" />
                    <span className="line-clamp-2">
                      <strong className="text-slate-900">{t("urride.areaMap.pickupPointLabel")}</strong> {routePickupLabel}
                    </span>
                  </div>
                ) : null}

                <div className="flex items-start gap-2">
                  <span className="mt-1 h-3 w-3 shrink-0 rounded-full bg-blue-600" />
                  <span className="line-clamp-2">
                    <strong className="text-slate-900">
                      {routeInfo?.routePlan ? t("urride.areaMap.dropoffPointLabel") : t("urride.areaMap.destinationLabel")}
                    </strong>{" "}
                    {routeToLabel}
                  </span>
                </div>
              </div>

              {routeInfo?.routePlan && routeInfo.legs?.length ? (
                <div className="mt-3 grid gap-2">
                  {routeInfo.legs.map((leg, index) => (
                    <div key={`${index}-${leg.distanceMeters}`} className="rounded-2xl border border-slate-100 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-600">
                      <span className="block font-black text-slate-900">
                        {index === 0 ? t("urride.areaMap.legFirst") : t("urride.areaMap.legSecond")}
                      </span>
                      <span className="mt-1 block">
                        {formatDistance(leg.distanceMeters)} - {formatDuration(leg.durationSeconds)}
                      </span>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          )}
        </div>
      )}

      {routeError && !showNavigationCard && (
        <div className="absolute bottom-6 left-4 z-30 rounded-2xl bg-red-600 px-4 py-3 text-sm font-bold text-white shadow-xl">
          {routeError}
        </div>
      )}

      {children}
    </div>
  );
}

function RouteHealthLegend({ activeKey }) {
  return (
    <div className="mt-3 grid grid-cols-3 gap-2">
      {[
        ["correct", t("urride.areaMap.legendGreen"), "bg-green-600"],
        ["warning", t("urride.areaMap.legendYellow"), "bg-yellow-400"],
        ["wrong", t("urride.areaMap.legendRed"), "bg-red-600"],
      ].map(([key, label, colorClass]) => (
        <span
          key={key}
          className={`flex items-center gap-2 rounded-2xl border px-2.5 py-2 text-[11px] font-black ${
            activeKey === key ? "border-slate-300 bg-slate-100 text-slate-950" : "border-slate-100 bg-white text-slate-500"
          }`}
        >
          <span className={`h-3 w-3 shrink-0 rounded-full ${colorClass}`} />
          {label}
        </span>
      ))}
    </div>
  );
}
