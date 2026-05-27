import { useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import {
  formatDistance,
  formatDuration,
  getRouteBetweenPoints,
} from "../../../Backend/services/routeService";

const DEFAULT_CENTER = {
  lat: 8.4657,
  lng: -13.2317,
  label: "Lumley, Freetown",
};

const ROUTE_STATUS = {
  correct: {
    label: "On recommended route",
    message: "You are moving correctly on the recommended route.",
    color: "#16a34a",
    className: "bg-green-100 text-green-700",
  },
  warning: {
    label: "Slightly off route",
    message: "You may be moving away from the recommended route. Check the map carefully.",
    color: "#eab308",
    className: "bg-yellow-100 text-yellow-700",
  },
  wrong: {
    label: "Wrong route detected",
    message: "You are far from the recommended route or moving backward. Consider rerouting.",
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
  rerouteCooldownMs: 14000,
  rerouteConfirmMs: 2600,
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
  wrapper.title = location?.name || "Nearby location";
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
  wrapper.title = report?.title || "Road report";
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
  wrapper.title = snapshot?.message || "Traffic update";
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
  wrapper.title = operator?.name || "Operator";
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
  wrapper.title = report?.title || "Road report";
  wrapper.textContent = icon;
  return wrapper;
}

function createSmartOperatorMarker(operator) {
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
  wrapper.title = operator?.name || "Operator";

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

function getRouteLookAheadPoint(coordinates = [], segmentIndex = 0, destination = null) {
  if (coordinates.length >= 2) {
    const safeIndex = Math.max(0, Math.min(segmentIndex, coordinates.length - 2));
    const lookAheadIndex = Math.max(safeIndex + 1, Math.min(safeIndex + 7, coordinates.length - 1));
    return normalizeRoutePoint(coordinates[lookAheadIndex]);
  }

  return destination?.lat && destination?.lng ? destination : null;
}

function getSmartCameraCenter(position, destination, coordinates = [], segmentIndex = 0, mode = "smart") {
  if (!position) return null;
  if (mode !== "smart") return position;

  const lookAhead = getRouteLookAheadPoint(coordinates, segmentIndex, destination);
  if (!lookAhead) return position;

  return {
    lat: lerp(position.lat, lookAhead.lat, 0.38),
    lng: lerp(position.lng, lookAhead.lng, 0.38),
  };
}

function getTrafficLevel(route, routeStatusKey) {
  if (!route?.distanceMeters || !route?.durationSeconds) {
    return { label: "Traffic checking", detail: "Waiting for movement data", className: "bg-slate-100 text-slate-600" };
  }

  const speedKmh = (route.distanceMeters / Math.max(route.durationSeconds, 1)) * 3.6;
  const hour = new Date().getHours();
  const isPeakTime = (hour >= 7 && hour <= 10) || (hour >= 16 && hour <= 20);

  if (routeStatusKey === "wrong") {
    return { label: "Traffic risk high", detail: "Wrong-route movement may cause delay", className: "bg-red-100 text-red-700" };
  }

  if (routeStatusKey === "warning" || speedKmh < 13 || isPeakTime) {
    return { label: "Traffic may be slow", detail: "Expect slower movement on this route", className: "bg-yellow-100 text-yellow-700" };
  }

  return { label: "Traffic looks normal", detail: "Route movement is currently clear", className: "bg-green-100 text-green-700" };
}

function getLiveTrafficInsight(trafficSnapshots = [], route, routeStatusKey) {
  const activeSnapshots = trafficSnapshots.filter((snapshot) => snapshot?.status && snapshot.status !== "green");
  const redSnapshot = activeSnapshots.find((snapshot) => snapshot.status === "red");
  const yellowSnapshot = activeSnapshots.find((snapshot) => snapshot.status === "yellow");

  if (redSnapshot) {
    return {
      label: "Traffic danger nearby",
      detail: redSnapshot.message || redSnapshot.roadName || "High-risk road condition reported",
      className: "bg-red-100 text-red-700",
    };
  }

  if (yellowSnapshot) {
    return {
      label: "Traffic caution nearby",
      detail: yellowSnapshot.message || yellowSnapshot.roadName || "Use caution around this area",
      className: "bg-yellow-100 text-yellow-700",
    };
  }

  return getTrafficLevel(route, routeStatusKey);
}

function LegacyWeatherMessage(currentWeather) {
  if (!currentWeather) {
    return { label: "Weather checking", detail: "Live weather will appear shortly", className: "bg-slate-100 text-slate-600" };
  }

  const code = Number(currentWeather.weather_code ?? currentWeather.weathercode ?? 0);
  const temperature = Math.round(currentWeather.temperature_2m ?? currentWeather.temperature ?? 0);
  const wind = Math.round(currentWeather.wind_speed_10m ?? currentWeather.windspeed ?? 0);
  const isRain = [51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82, 95, 96, 99].includes(code);
  const isFog = [45, 48].includes(code);

  if (isRain) {
    return { label: `${temperature}°C • Rain risk`, detail: `Riders may move slower. Wind ${wind} km/h`, className: "bg-blue-100 text-blue-700" };
  }

  if (isFog) {
    return { label: `${temperature}°C • Low visibility`, detail: `Use extra caution. Wind ${wind} km/h`, className: "bg-yellow-100 text-yellow-700" };
  }

  return { label: `${temperature}°C • Weather clear`, detail: `Good travel condition. Wind ${wind} km/h`, className: "bg-sky-100 text-sky-700" };
}

function getSmartWeatherMessage(currentWeather) {
  if (!currentWeather) {
    return {
      label: "Weather checking",
      detail: "Live weather will appear shortly",
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
      label: `${temperature}°C • Road danger`,
      detail: message || "Weather may make road movement unsafe",
      className: "bg-red-100 text-red-700",
      relevant: true,
    };
  }

  if (hasRainRisk) {
    return {
      label: `${temperature}°C • Rain risk`,
      detail: message || `Roads may be slippery. Wind ${wind} km/h`,
      className: "bg-blue-100 text-blue-700",
      relevant: true,
    };
  }

  if (hasVisibilityRisk || riskLevel === "caution") {
    return {
      label: `${temperature}°C • Visibility caution`,
      detail: message || `Use extra caution. Wind ${wind} km/h`,
      className: "bg-yellow-100 text-yellow-700",
      relevant: true,
    };
  }

  return {
    label: `${temperature}°C • Weather clear`,
    detail: message || `Good travel condition. Wind ${wind} km/h`,
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
      label: snapshot.message || snapshot.roadName || snapshot.areaName || "Traffic ahead",
    })),
    ...reports.map((report) => ({
      ...report,
      signalKind: "report",
      status: getSignalStatus(report),
      label: report.title || report.description || "Road report ahead",
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
        label: "Traffic ahead",
        detail: signal.label || signal.message || signal.description || "Slow or risky movement detected ahead",
        roadName: signal.roadName || signal.areaName || "Affected road area",
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
  focusMode = false,
  operatorLocations = [],
  nearbyMapLocations = [],
  reportLocations = [],
  trafficSnapshots = [],
  weatherCache = null,
  onMapLocationSelect,
  onReportSelect,
  recenterSignal = 0,
}) {
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const userMarkerRef = useRef(null);
  const destinationMarkerRef = useRef(null);
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
  const isUserInteractingRef = useRef(false);
  const userInteractionIdleTimerRef = useRef(null);
  const lastParentLocationRef = useRef(null);
  const lastParentLocationAtRef = useRef(0);
  const gpsUiRef = useRef({ status: `Showing ${DEFAULT_CENTER.label}`, accuracy: null, time: 0 });
  const headingUiRef = useRef({ heading: null, time: 0 });
  const navigationDragRef = useRef(null);

  const [locationStatus, setLocationStatus] = useState(`Showing ${DEFAULT_CENTER.label}`);
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

  const routeStatus = ROUTE_STATUS[routeStatusKey];
  const showNavigationCard = Boolean(routeLoading || routeInfo || routeError);
  const navigationCollapsed = navigationSnap === "collapsed";
  const routeDistanceLabel = routeInfo?.distance || (routeLoading ? "Finding route" : "Route");
  const routeDurationLabel = routeInfo?.duration || (routeError ? "Check route" : "");
  const routeSummaryLabel = routeDurationLabel ? `${routeDistanceLabel} - ${routeDurationLabel}` : routeDistanceLabel;
  const routeFromLabel = routeInfo?.from || "Current location";
  const routeToLabel = routeInfo?.to || selectedLocation?.name || selectedLocation?.label || "selected location";
  const canUseHeading = headingMode !== "north";
  const weatherInsight = getSmartWeatherMessage(weather);
  const showWeatherBadge = Boolean(weatherError || weatherInsight.relevant);

  function setNextNavigationSnap(direction) {
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

    setLocationStatus(`Off route - checking better route (${Math.round(distanceFromRoute)}m)`);

    rerouteTimerRef.current = window.setTimeout(() => {
      rerouteTimerRef.current = null;
      lastRerouteAtRef.current = Date.now();
      routeStartOverrideRef.current = position;
      setRouteInfo((current) =>
        current
          ? {
              ...current,
              distance: "Rerouting",
              duration: "...",
            }
          : current,
      );
      setRerouteKey((value) => value + 1);
    }, GPS_SETTINGS.rerouteConfirmMs);
  }

  const routeCardStatus = routeError
    ? {
        label: "Route needs attention",
        message: routeError,
        className: "bg-red-100 text-red-700",
      }
    : routeLoading
      ? {
          label: "Calculating route",
          message: "Getting the recommended route and live safety colors.",
          className: "bg-blue-100 text-blue-700",
        }
      : routeStatus;
  const activeTrafficInsight = trafficAhead
    ? {
        label: trafficAhead.label || "Traffic ahead",
        detail: `${trafficAhead.roadName || "Affected road"} - ${trafficAhead.detail}`,
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
      const route = await getRouteBetweenPoints(start, selectedLocation);
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
      setAlternativeError("Alternative route unavailable right now.");
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
      from: userLocationRef.current ? "CURRENT LOCATION" : DEFAULT_CENTER.label,
      to: selectedLocation.name,
      distance: formatDistance(route.distanceMeters),
      duration: formatDuration(route.durationSeconds),
      raw: route,
    });
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
    };

    const markUserInteractionEnd = () => {
      if (userInteractionIdleTimerRef.current) window.clearTimeout(userInteractionIdleTimerRef.current);
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

    map.on("error", (event) => {
      if (!MAPTILER_KEY || !isMapTilerRequestError(event) || map.getSource("osm-tiles")) return;
      console.warn("MapTiler style could not load. Falling back to OpenStreetMap raster tiles.", event?.error);
      map.setStyle(osmRasterStyle);
    });

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
      destinationMarkerRef.current?.remove();

      clearRouteLayers(map);
      clearTrafficOverlayLayers(map);
      clearTrafficAheadRouteLayer(map);
      clearAlternativeRouteLayer(map);

      map.remove();
      mapRef.current = null;
      userMarkerRef.current = null;
      destinationMarkerRef.current = null;
      watchIdRef.current = null;
      markerRenderedPositionRef.current = null;
    };
  }, [onMapReady]);

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
      publishGpsUi(`Showing ${DEFAULT_CENTER.label}`, null, { force: true });
      setUserLocation(DEFAULT_CENTER);
      userLocationRef.current = DEFAULT_CENTER;
      smoothedPositionRef.current = DEFAULT_CENTER;
      markerRenderedPositionRef.current = DEFAULT_CENTER;
      lastRawPositionRef.current = DEFAULT_CENTER;
      lastRawTimestampRef.current = Date.now();
      return;
    }

    publishGpsUi("Checking location...", null, { force: true });

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const accuracy = Math.round(position.coords.accuracy || 0);
        const nextCenter = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          label: "Your current area",
          accuracy,
        };

        publishGpsUi("Using your current area", accuracy, { force: true });
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
        publishGpsUi(`Showing ${DEFAULT_CENTER.label}`, null, { force: true });
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

    applySmartCamera(current, selectedLocation, lastRouteSegmentIndexRef.current, { force: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- recenter should run only when the user taps the recenter button.
  }, [recenterSignal]);

  useEffect(() => {
    routeInfoRef.current = routeInfo;
  }, [routeInfo]);

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

    async function drawRoute() {
      if (!selectedLocation || !mapRef.current) return;

      const routeStart = routeStartOverrideRef.current || smoothedPositionRef.current || userLocationRef.current || DEFAULT_CENTER;
      const map = mapRef.current;

      setRouteError("");
      setRouteLoading(true);
      setRouteInfo({
        from: userLocationRef.current ? "CURRENT LOCATION" : DEFAULT_CENTER.label,
        to: selectedLocation.name || "Selected destination",
        distance: "Finding route",
        duration: "...",
      });
      setRouteStatusKey("correct");
      routeStatusRef.current = "correct";
      setNavigationSnap("half");
      setAlternativeRoute(null);
      setAlternativeError("");
      alternativeRouteRef.current = null;
      clearAlternativeRouteLayer(map);
      lastRouteSegmentIndexRef.current = 0;
      arrivalReachedRef.current = false;

      destinationMarkerRef.current?.remove();

      const destinationMarkerLabel = selectedLocation.type === "seller" ? "STORE" : "DESTINATION";

      destinationMarkerRef.current = new maplibregl.Marker({
        element: createLabeledMarker(destinationMarkerLabel, "#2563eb"),
        anchor: "center",
      })
        .setLngLat([selectedLocation.lng, selectedLocation.lat])
        .addTo(map);

      await waitForMapStyle(map);

      const route = await getRouteBetweenPoints(routeStart, selectedLocation);

      if (cancelled) return;

      routeCoordinatesRef.current = route.geometry.coordinates || [];
      originalRouteRef.current = route;

      upsertRouteLayers(map, route.geometry, ROUTE_STATUS.correct.color);

      const bounds = new maplibregl.LngLatBounds();
      route.geometry.coordinates.forEach((coord) => bounds.extend(coord));

      map.fitBounds(bounds, {
        padding: { top: 140, bottom: 230, left: 70, right: 70 },
        duration: 900,
      });

      window.setTimeout(() => {
        if (!cancelled) applySmartCamera(routeStart, selectedLocation, 0, { force: true });
      }, 950);

      setRouteInfo({
        from: userLocationRef.current ? "CURRENT LOCATION" : DEFAULT_CENTER.label,
        to: selectedLocation.name,
        distance: formatDistance(route.distanceMeters),
        duration: formatDuration(route.durationSeconds),
        raw: route,
      });
      setTrafficInsight(getLiveTrafficInsight(trafficSnapshotsRef.current, route, "correct"));
      evaluateTrafficAhead({ force: true });
      setRouteLoading(false);
      routeStartOverrideRef.current = null;
    }

    drawRoute().catch(() => {
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
        from: userLocationRef.current ? "CURRENT LOCATION" : DEFAULT_CENTER.label,
        to: selectedLocation?.name || "Selected destination",
        distance: "Route unavailable",
        duration: "Try again",
      });
      setNavigationSnap("half");
      setRouteError("Route unavailable. Check the route key or try another location.");
    });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- route drawing is keyed by destination/reroute only; camera helpers read current refs.
  }, [selectedLocation, rerouteKey]);

  useEffect(() => {
    if (!navigator.geolocation || !mapRef.current) return;

    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }

    watchIdRef.current = navigator.geolocation.watchPosition(
      (position) => {
        const accuracy = Math.round(position.coords.accuracy || 0);

        if (accuracy > GPS_SETTINGS.ignoreAccuracyAboveMeters) {
          publishGpsUi(`Weak GPS signal - ${accuracy}m accuracy`, accuracy);
          return;
        }

        const rawLivePosition = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          label: "Live current location",
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
            publishGpsUi(`Filtering GPS jump - ${accuracy}m accuracy`, accuracy);
            return;
          }
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
            ? `Low GPS accuracy - ${accuracy}m`
            : "Live tracking active",
          accuracy,
        );
        userLocationRef.current = livePosition;
        publishLocationToParent(livePosition);
        const markerStartPosition =
          markerRenderedPositionRef.current ||
          getMarkerPosition(userMarkerRef.current, previousSmoothedPosition) ||
          previousSmoothedPosition;

        markerAnimationCancelRef.current?.();
        markerAnimationCancelRef.current = animateMarkerTo(
          userMarkerRef.current,
          markerStartPosition,
          livePosition,
          GPS_SETTINGS.animationMs,
          (renderedPosition) => {
            markerRenderedPositionRef.current = renderedPosition;
          },
        );

        smoothedPositionRef.current = livePosition;

        if (routeInfoRef.current && routeStatusRef.current === "correct") {
          setNavigationSnap("collapsed");
        }

        if ((focusMode || headingMode !== "north") && !isUserInteractingRef.current) {
          applySmartCamera(livePosition, selectedLocation);
        }

        if (routeCoordinatesRef.current.length) {
          const nearestRouteInfo = getNearestRouteInfo(livePosition, routeCoordinatesRef.current);
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
            setLocationStatus("Arrived at destination");
            setNavigationSnap("half");
            setRouteInfo((current) =>
              current
                ? {
                    ...current,
                    distance: "0 m",
                    duration: "Arrived",
                  }
                : current,
            );
            return;
          }

          const isMovingBackward =
            nearestRouteInfo.segmentIndex + GPS_SETTINGS.progressBacktrackSegments <
            lastRouteSegmentIndexRef.current;

          if (!isMovingBackward) {
            lastRouteSegmentIndexRef.current = Math.max(
              lastRouteSegmentIndexRef.current,
              nearestRouteInfo.segmentIndex,
            );
          }

          const nextStatusKey = getRouteStatus(nearestRouteInfo.distance, isMovingBackward);

          if (nextStatusKey !== routeStatusRef.current) {
            routeStatusRef.current = nextStatusKey;
            setRouteStatusKey(nextStatusKey);

            if (nextStatusKey === "warning" || nextStatusKey === "wrong") {
              setNavigationSnap("half");
            }
          }

          if (nextStatusKey === "correct" || nearestRouteInfo.distance <= GPS_SETTINGS.warningRouteMeters) {
            clearPendingReroute();
          } else if (nearestRouteInfo.distance >= GPS_SETTINGS.rerouteRouteMeters) {
            scheduleRerouteFrom(livePosition, nearestRouteInfo.distance);
          }

          setRouteLineColor(mapRef.current, ROUTE_STATUS[nextStatusKey].color);
          setTrafficInsight((current) => {
            const next = getLiveTrafficInsight(
              trafficSnapshotsRef.current,
              routeInfoRef.current?.raw || null,
              nextStatusKey,
            );
            return next.label === current?.label ? current : next;
          });
          evaluateTrafficAhead();
          applySmartCamera(livePosition, selectedLocation, nearestRouteInfo.segmentIndex);
        }
      },
      () => {
        publishGpsUi("Location permission needed for live tracking", null, { force: true });
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
  }, [focusMode, headingMode, onLocationResolved, selectedLocation]);

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
            updateOperatorMarkerElement(existingMarker.getElement(), operator);
          }),
        );
        updateOperatorMarkerElement(existingMarker.getElement(), operator);
        return;
      }

      const marker = new maplibregl.Marker({
        element: createSmartOperatorMarker(operator),
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

      {!focusMode && (
        <div className="pointer-events-none absolute left-3 top-28 z-10 rounded-full bg-white/90 px-3 py-1 text-xs font-black text-slate-700 shadow sm:left-5 sm:top-28">
          {locationStatus}
          {gpsAccuracy ? <span className="ml-2 text-slate-400">GPS {gpsAccuracy}m</span> : null}
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
            aria-label="Toggle map direction mode"
          >
            {headingMode === "smart" ? "SMART" : headingMode === "compass" ? "COMPASS" : "NORTH"}
            {heading != null && headingMode !== "north" ? <span className="ml-1 text-white/60">{heading}°</span> : null}
          </button>
        </div>
      )}

      {showNavigationCard && (
        <div
          className={`area-route-sheet absolute z-30 rounded-3xl bg-white/95 text-slate-950 shadow-2xl backdrop-blur ${navigationSnap}`}
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
            <span className="mt-1 text-[10px] font-black uppercase tracking-wide text-slate-400">Drag</span>
          </div>

          <div className="flex items-center justify-between gap-3 px-4 pb-3 pt-1">
            <button
              type="button"
              onClick={() => setNextNavigationSnap(navigationCollapsed ? "up" : "down")}
              className="kt-pressable rounded-full bg-green-50 px-3 py-1.5 text-xs font-black uppercase tracking-wide text-green-700"
              aria-label={navigationCollapsed ? "Expand navigation sheet" : "Collapse navigation sheet"}
            >
              Live Navigation
            </button>

            <div className="flex items-center gap-2">
              <span className={`rounded-full px-2.5 py-1 text-[11px] font-black ${routeCardStatus.className}`}>
                {routeCardStatus.label}
              </span>

              <button
                type="button"
                onClick={() => setNextNavigationSnap(navigationCollapsed ? "up" : "down")}
                className="kt-pressable flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-slate-700"
                aria-label={navigationCollapsed ? "Expand navigation" : "Collapse navigation"}
              >
                {navigationCollapsed ? "+" : "-"}
              </button>
            </div>
          </div>

          {navigationCollapsed ? (
            <div className="flex items-center justify-between gap-3 px-4 pb-4">
              <h3 className="text-lg font-black">
                {routeSummaryLabel}
              </h3>
              <span className={`rounded-2xl px-3 py-2 text-xs font-black ${routeCardStatus.className}`}>
                {routeError ? "CHECK" : routeLoading ? "WAIT" : routeStatusKey.toUpperCase()}
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
                    To: {routeToLabel}
                  </p>
                </div>

                <div className={`rounded-2xl px-3 py-2 text-xs font-black ${routeCardStatus.className}`}>
                  {routeError ? "CHECK" : routeLoading ? "WAIT" : routeStatusKey.toUpperCase()}
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
                  <span className="block font-black">Traffic ahead near {trafficAhead.roadName || "this route"}</span>
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
                    {alternativeLoading ? "Finding alternative route..." : "Find Alternative Route"}
                  </button>

                  {alternativeRoute ? (
                    <div className="rounded-2xl bg-slate-100 px-3 py-2 text-xs font-bold text-slate-700">
                      <div className="flex items-center justify-between gap-3">
                        <span>
                          Alternative: {alternativeRoute.distance} - {alternativeRoute.duration}
                        </span>
                        <span className={alternativeRoute.avoidsIssue ? "text-green-700" : "text-yellow-700"}>
                          {alternativeRoute.avoidsIssue ? "Cleaner" : "Caution"}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={handleUseAlternativeRoute}
                        className="mt-2 h-9 w-full rounded-xl bg-slate-950 text-xs font-black text-white"
                      >
                        Use Alternative
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
                    <strong className="text-slate-900">CURRENT LOCATION:</strong> {routeFromLabel}
                  </span>
                </div>

                <div className="flex items-start gap-2">
                  <span className="mt-1 h-3 w-3 shrink-0 rounded-full bg-blue-600" />
                  <span className="line-clamp-2">
                    <strong className="text-slate-900">DESTINATION:</strong> {routeToLabel}
                  </span>
                </div>
              </div>
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
        ["correct", "Green", "bg-green-600"],
        ["warning", "Yellow", "bg-yellow-400"],
        ["wrong", "Red", "bg-red-600"],
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
