import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  FiAlertTriangle,
  FiBookmark,
  FiChevronDown,
  FiChevronUp,
  FiCrosshair,
  FiEye,
  FiEyeOff,
  FiLock,
  FiMapPin,
  FiNavigation,
  FiPhone,
  FiPlus,
  FiSearch,
  FiShield,
  FiUnlock,
  FiX,
} from "react-icons/fi";
import AppBackTab from "../shared/AppBackTab";
import { useAutoCollapseCard } from "../shared/motionHooks";
import NearbyAreaMap from "./area/NearbyAreaMap";
import { searchLocations } from "../../Backend/services/locationSearchService";
import { getRouteBetweenPoints } from "../../Backend/services/routeService";
import { showToast } from "../../Backend/services/toastService";
import {
  getActiveAreaReports,
  getActiveTrafficSnapshots,
  getActiveTransportOperators,
  getApprovedNearbyLocations,
  deleteNearbySearchHistory,
  getWeatherCacheNearArea,
  getRecentSearchHistory,
  saveSearchHistory,
  submitNearbyAreaLocation,
  subscribeToAreaViewLiveData,
} from "../../Backend/services/nearbyAreaLiveService";
import { detectCountryFromCoords } from "../../Backend/utils/detectCountry";
import { getActiveCountryProfile, getCountryPhonePlaceholder } from "../../data/westAfricanCountryProfiles";
import {
  emergencyContacts,
  locationCategories,
  locationStatusStyles,
  nearbyLocations,
} from "../services/nearbyAreaService";
import EmergencySheet from "../emergency/EmergencySheet";

const addCategories = [
  "Shop",
  "School",
  "Supermarket",
  "Pharmacy",
  "Hospital / Clinic",
  "Police",
  "Fuel Station",
  "Pickup Point",
  "Transport Park",
  "Market",
  "Other",
];

const primaryLocationCategories = locationCategories.slice(0, 3);
const moreLocationCategories = locationCategories.slice(3);

const SOS_COUNTRY_CACHE_KEY = "kuntai-sos-country-code";
const SOS_FALLBACK_COUNTRY = getActiveCountryProfile().iso2;
const MAP_CENTER_PUBLISH_METERS = 35;
const MAP_CENTER_PUBLISH_DEBOUNCE_MS = 450;
const WEATHER_REFRESH_METERS = 1200;
const WEATHER_REFRESH_MS = 1000 * 60 * 16;
const WEATHER_REFRESH_DEBOUNCE_MS = 900;
const LIVE_AREA_REFRESH_METERS = 1600;
const LIVE_AREA_REFRESH_MS = 1000 * 60 * 2;
const LIVE_AREA_RADIUS_KM = 25;
const ACTIVE_OPERATOR_EMPTY_TOAST_MESSAGE =
  "No registered fleets are currently active nearby. Try expanding the area or check again shortly.";
const ACTIVE_OPERATOR_EMPTY_TOAST_COOLDOWN_MS = 45000;
const ONE_KM_PREVIEW_METERS = 1000;
const ONE_KM_ROUTE_SEARCH_METERS = 1350;
const ONE_KM_ROUTE_START_SNAP_LIMIT_METERS = 160;
const ONE_KM_ROUTE_TIMEOUT_MS = 7000;
const ONE_KM_ROUTE_BEARINGS = [0, 45, 90, 135, 180, 225, 270, 315];

function createAddLocationDraft() {
  return {
    name: "",
    category: addCategories[0],
    categoryName: "",
    address: "",
    landmark: "",
    phone: "",
    openingHours: "",
    description: "",
    lat: null,
    lng: null,
    coordinatesLabel: "",
    source: "",
  };
}

function getBrowserCurrentPosition() {
  return new Promise((resolve, reject) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      reject(new Error("Location is not supported in this browser."));
      return;
    }

    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      maximumAge: 0,
      timeout: 15000,
    });
  });
}

function MapCardCollapseButton({ className = "", collapsed, label, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`kt-pressable flex h-12 w-12 flex-none items-center justify-center rounded-full border-2 border-slate-300 bg-white/95 text-xl font-black text-slate-950 shadow-lg backdrop-blur ${className}`}
      aria-label={label}
    >
      {collapsed ? <FiChevronUp strokeWidth={3.2} /> : <FiChevronDown strokeWidth={3.2} />}
    </button>
  );
}

function formatCoordinatesLabel(point) {
  const lat = Number(point?.lat ?? point?.latitude);
  const lng = Number(point?.lng ?? point?.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return "";
  return `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
}

function toRadians(value) {
  return (value * Math.PI) / 180;
}

function distanceInMeters(pointA, pointB) {
  if (!pointA || !pointB) return Infinity;

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

function destinationPointFromDistance(origin, distanceMeters, bearingDegrees = 90) {
  const lat = Number(origin?.lat);
  const lng = Number(origin?.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  const earthRadius = 6371000;
  const angularDistance = distanceMeters / earthRadius;
  const bearing = toRadians(bearingDegrees);
  const startLat = toRadians(lat);
  const startLng = toRadians(lng);

  const endLat = Math.asin(
    Math.sin(startLat) * Math.cos(angularDistance) +
      Math.cos(startLat) * Math.sin(angularDistance) * Math.cos(bearing),
  );
  const endLng =
    startLng +
    Math.atan2(
      Math.sin(bearing) * Math.sin(angularDistance) * Math.cos(startLat),
      Math.cos(angularDistance) - Math.sin(startLat) * Math.sin(endLat),
    );

  return {
    lat: (endLat * 180) / Math.PI,
    lng: (endLng * 180) / Math.PI,
  };
}

function coordinateToPoint(coordinate) {
  if (!Array.isArray(coordinate) || coordinate.length < 2) return null;
  const lng = Number(coordinate[0]);
  const lat = Number(coordinate[1]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

function pointToCoordinate(point) {
  return [point.lng, point.lat];
}

function getRouteGeometryPoints(geometry) {
  if (geometry?.type !== "LineString" || !Array.isArray(geometry.coordinates)) return [];
  return geometry.coordinates.map(coordinateToPoint).filter(Boolean);
}

function interpolateRoutePoint(start, end, amount) {
  return {
    lat: start.lat + (end.lat - start.lat) * amount,
    lng: start.lng + (end.lng - start.lng) * amount,
  };
}

function buildStraightOneKmPreview(origin) {
  const destination = destinationPointFromDistance(origin, ONE_KM_PREVIEW_METERS, 90);
  if (!destination) return null;

  return {
    label: "1 KM",
    routeMode: "straight",
    distanceMeters: ONE_KM_PREVIEW_METERS,
    origin: {
      ...origin,
      name: "Current location",
    },
    destination: {
      ...destination,
      name: "1 KM point",
    },
    geometry: {
      type: "LineString",
      coordinates: [
        pointToCoordinate(origin),
        pointToCoordinate(destination),
      ],
    },
  };
}

function withRouteTimeout(promise, timeoutMs) {
  let timeoutId;
  const timeout = new Promise((_, reject) => {
    timeoutId = window.setTimeout(() => reject(new Error("Route lookup timed out")), timeoutMs);
  });

  return Promise.race([promise, timeout]).finally(() => {
    window.clearTimeout(timeoutId);
  });
}

function clipRouteToOneKilometre(origin, route) {
  if (route?.approximate) return null;

  const routePoints = getRouteGeometryPoints(route?.geometry);
  if (routePoints.length < 2) return null;

  const startSnapMeters = distanceInMeters(origin, routePoints[0]);
  if (!Number.isFinite(startSnapMeters) || startSnapMeters > ONE_KM_ROUTE_START_SNAP_LIMIT_METERS) {
    return null;
  }

  const points = startSnapMeters > 2 ? [origin, ...routePoints] : routePoints;
  const clippedCoordinates = [pointToCoordinate(points[0])];
  let travelledMeters = 0;

  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1];
    const current = points[index];
    const segmentMeters = distanceInMeters(previous, current);
    if (!Number.isFinite(segmentMeters) || segmentMeters <= 0) continue;

    if (travelledMeters + segmentMeters >= ONE_KM_PREVIEW_METERS) {
      const remainingMeters = ONE_KM_PREVIEW_METERS - travelledMeters;
      const destination = interpolateRoutePoint(previous, current, remainingMeters / segmentMeters);
      clippedCoordinates.push(pointToCoordinate(destination));

      return {
        label: "1 KM",
        routeMode: "road",
        distanceMeters: ONE_KM_PREVIEW_METERS,
        routeDistanceMeters: route.distanceMeters || travelledMeters + segmentMeters,
        startSnapMeters,
        origin: {
          ...origin,
          name: "Current location",
        },
        destination: {
          ...destination,
          name: "1 KM point",
        },
        geometry: {
          type: "LineString",
          coordinates: clippedCoordinates,
        },
      };
    }

    travelledMeters += segmentMeters;
    clippedCoordinates.push(pointToCoordinate(current));
  }

  return null;
}

async function buildRoadOneKmPreview(origin) {
  const candidates = ONE_KM_ROUTE_BEARINGS
    .map((bearing) => ({
      bearing,
      destination: destinationPointFromDistance(origin, ONE_KM_ROUTE_SEARCH_METERS, bearing),
    }))
    .filter((candidate) => candidate.destination);

  const routeResults = await Promise.allSettled(
    candidates.map(async (candidate) => {
      const route = await withRouteTimeout(
        getRouteBetweenPoints(origin, candidate.destination),
        ONE_KM_ROUTE_TIMEOUT_MS,
      );
      const preview = clipRouteToOneKilometre(origin, route);
      if (!preview) return null;

      const routePointCount = route.geometry?.coordinates?.length || 0;
      const routeDistance = Number(route.distanceMeters || 0);
      const distancePenalty = Number.isFinite(routeDistance)
        ? Math.abs(routeDistance - ONE_KM_ROUTE_SEARCH_METERS) * 0.08
        : 120;
      const detailBonus = Math.min(routePointCount, 24);

      return {
        ...preview,
        bearing: candidate.bearing,
        score: preview.startSnapMeters * 6 + distancePenalty - detailBonus,
      };
    }),
  );

  return routeResults
    .map((result) => (result.status === "fulfilled" ? result.value : null))
    .filter(Boolean)
    .sort((first, second) => first.score - second.score)[0] || null;
}

async function reverseGeocodePoint(point) {
  const lat = Number(point?.lat ?? point?.latitude);
  const lng = Number(point?.lng ?? point?.longitude);
  const fallbackAddress = formatCoordinatesLabel({ lat, lng }) || "Selected map location";

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return {
      address: "Selected map location",
      city: "",
      country: "",
      lat: null,
      lng: null,
    };
  }

  try {
    const response = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2&addressdetails=1&lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lng)}`,
      { headers: { Accept: "application/json" } },
    );

    if (!response.ok) throw new Error("Location details unavailable");

    const data = await response.json();
    const address = data?.address || {};
    return {
      address: data?.display_name || fallbackAddress,
      city: address.city || address.town || address.village || address.county || "",
      country: address.country || "",
      lat,
      lng,
    };
  } catch {
    return {
      address: fallbackAddress,
      city: "",
      country: "",
      lat,
      lng,
    };
  }
}

function normalizePosition(position) {
  const lat = Number(position?.lat);
  const lng = Number(position?.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { ...position, lat, lng };
}

function getShortAddress(result) {
  return [result.address || result.fullAddress || result.placeName, result.country]
    .filter(Boolean)
    .join(", ") || "Address details unavailable";
}

function buildInitialMapDestination(destination) {
  if (!destination) return null;
  const lat = Number(destination.lat ?? destination.latitude);
  const lng = Number(destination.lng ?? destination.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  return {
    id: destination.id || `destination-${lat}-${lng}`,
    type: destination.type || "destination",
    name: destination.name || destination.label || "Selected destination",
    category: destination.category || (destination.type === "seller" ? "Seller" : "Destination"),
    address: destination.address || destination.fullAddress || "",
    distance: destination.distance || (destination.type === "seller" ? "Seller location" : "Selected location"),
    status: destination.status || "verified",
    description:
      destination.description ||
      (destination.type === "seller"
        ? "Seller store location from UrMall."
        : "Selected destination from KunThai."),
    lat,
    lng,
  };
}

function getInitialDestinationSearchText(destination) {
  return String(
    destination?.searchQuery ||
      destination?.query ||
      destination?.name ||
      destination?.label ||
      destination?.address ||
      destination?.fullAddress ||
      "",
  ).trim();
}

function buildRouteWaypoint(point, fallbackName) {
  if (!point) return null;
  const rawLat = point.lat ?? point.latitude;
  const rawLng = point.lng ?? point.longitude;
  const lat = rawLat == null || rawLat === "" ? null : Number(rawLat);
  const lng = rawLng == null || rawLng === "" ? null : Number(rawLng);
  const searchQuery = String(
    point.searchQuery || point.address || point.fullAddress || point.label || point.name || "",
  ).trim();

  return {
    ...point,
    name: fallbackName,
    label: fallbackName,
    address: point.address || point.fullAddress || searchQuery,
    searchQuery,
    lat: Number.isFinite(lat) ? lat : null,
    lng: Number.isFinite(lng) ? lng : null,
  };
}

async function resolveRouteWaypoint(point, center, fallbackName) {
  const waypoint = buildRouteWaypoint(point, fallbackName);
  if (!waypoint) return null;
  if (Number.isFinite(waypoint.lat) && Number.isFinite(waypoint.lng)) return waypoint;
  if (!waypoint.searchQuery) return null;

  const results = await searchLocations(waypoint.searchQuery, center);
  const result = Array.isArray(results) ? results[0] : null;
  const lat = Number(result?.lat);
  const lng = Number(result?.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  return {
    ...waypoint,
    address: waypoint.address || result.address || result.name || waypoint.searchQuery,
    lat,
    lng,
  };
}

function isFutureOrMissing(value) {
  if (!value) return true;
  const timestamp = new Date(value).getTime();
  return !Number.isFinite(timestamp) || timestamp > Date.now();
}

function uniqueById(items) {
  const seen = new Set();
  return items.filter((item) => {
    if (!item?.id || seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

function getTrafficStatusFromReport(report) {
  const severity = String(report?.severity || "").toLowerCase();
  if (["critical", "high", "danger", "red"].includes(severity)) return "red";
  if (["medium", "moderate", "warning", "yellow"].includes(severity)) return "yellow";
  return report?.type === "traffic" ? "yellow" : "green";
}

function getReportRadius(report) {
  if (report?.type === "accident" || report?.type === "road_block" || report?.type === "emergency") return 520;
  if (report?.type === "traffic" || report?.type === "flooding" || report?.type === "bad_road") return 420;
  return 320;
}

function buildReportTrafficSignals(reports = []) {
  return reports
    .filter((report) => report?.lat != null && report?.lng != null && isFutureOrMissing(report.expiresAt))
    .map((report) => ({
      id: `report-traffic-${report.id}`,
      status: getTrafficStatusFromReport(report),
      source: "report",
      roadName: report.roadName || report.areaName || "",
      areaName: report.areaName || "",
      message: report.title || report.description || "Road report",
      lat: report.lat,
      lng: report.lng,
      radiusMeters: getReportRadius(report),
      confidenceScore: report.verified ? 0.86 : 0.62,
      expiresAt: report.expiresAt,
      linkedReportId: report.id,
    }))
    .filter((snapshot) => snapshot.status !== "green");
}

function buildOperatorTrafficSignals(operators = []) {
  const slowOperators = operators.filter((operator) => {
    const speed = Number(operator?.speedMps);
    return operator?.lat != null && operator?.lng != null && Number.isFinite(speed) && speed >= 0 && speed <= 3.8;
  });
  const visited = new Set();
  const clusters = [];

  slowOperators.forEach((operator) => {
    if (visited.has(operator.id)) return;
    const cluster = slowOperators.filter((candidate) => {
      if (visited.has(candidate.id)) return false;
      return distanceInMeters(operator, candidate) <= 180;
    });

    if (cluster.length < 3) return;
    cluster.forEach((item) => visited.add(item.id));

    const avgSpeed =
      cluster.reduce((sum, item) => sum + Math.max(0, Number(item.speedMps || 0)), 0) / Math.max(cluster.length, 1);
    const center = cluster.reduce(
      (sum, item) => ({ lat: sum.lat + item.lat / cluster.length, lng: sum.lng + item.lng / cluster.length }),
      { lat: 0, lng: 0 },
    );

    clusters.push({
      id: `operator-slow-${cluster.map((item) => item.id).sort().join("-")}`,
      status: cluster.length >= 5 || avgSpeed <= 1.8 ? "red" : "yellow",
      source: "operators",
      roadName: "",
      areaName: "Live operator movement",
      message: `${cluster.length} nearby operators moving slowly`,
      averageSpeedMps: avgSpeed,
      confidenceScore: Math.min(0.9, 0.48 + cluster.length * 0.08),
      lat: center.lat,
      lng: center.lng,
      radiusMeters: cluster.length >= 5 ? 620 : 460,
      expiresAt: new Date(Date.now() + 1000 * 60 * 8).toISOString(),
    });
  });

  return clusters.slice(0, 12);
}

function buildTrafficIntelligence({ snapshots = [], reports = [], operators = [] }) {
  return uniqueById([
    ...snapshots.filter((snapshot) => isFutureOrMissing(snapshot.expiresAt)),
    ...buildReportTrafficSignals(reports),
    ...buildOperatorTrafficSignals(operators),
  ]).slice(0, 120);
}


export default function NearbyAreaScreen({
  onBack,
  onDone,
  onLocationPicked,
  initialDestination = null,
  autoRoute = false,
  mode = "standard",
  pickerStart = "current",
  pickerLabels = null,
  backLabel = "Back to transport",
}) {
  const [activeCategory, setActiveCategory] = useState("All");
  const [activeLocation, setActiveLocation] = useState(nearbyLocations[0]);
  const [locationPanelOpen, setLocationPanelOpen] = useState(false);
  const [moreCategoriesOpen, setMoreCategoriesOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [mapCenter, setMapCenter] = useState(null);
  const [userLocation, setUserLocation] = useState(null);
  const [focusMode, setFocusMode] = useState(false);
  const [mapLocked, setMapLocked] = useState(false);
  const [searchOverlayOpen, setSearchOverlayOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [selectionLocked, setSelectionLocked] = useState(false);
  const [mapInstance, setMapInstance] = useState(null);
  const [selectedSearchLocation, setSelectedSearchLocation] = useState(null);
  const [operatorRoutePlan, setOperatorRoutePlan] = useState(null);
  const [recenterSignal, setRecenterSignal] = useState(0);
  const [liveLocations, setLiveLocations] = useState([]);
  const [liveOperators, setLiveOperators] = useState([]);
  const [liveReports, setLiveReports] = useState([]);
  const [trafficSnapshots, setTrafficSnapshots] = useState([]);
  const [recentSearches, setRecentSearches] = useState([]);
  const [weatherCache, setWeatherCache] = useState(null);
  const [addLocationDraft, setAddLocationDraft] = useState(createAddLocationDraft);
  const [addLocationMode, setAddLocationMode] = useState("form");
  const [addLocationStatus, setAddLocationStatus] = useState("");
  const [addLocationBusy, setAddLocationBusy] = useState(false);
  const [addLocationLocateCautionOpen, setAddLocationLocateCautionOpen] = useState(false);
  const [sosOpen, setSosOpen] = useState(false);
  const [detectedCountryCode, setDetectedCountryCode] = useState(SOS_FALLBACK_COUNTRY);
  const [detectingSosCountry, setDetectingSosCountry] = useState(false);
  const [businessPickerMode, setBusinessPickerMode] = useState(pickerStart === "dropPin" ? "dropPin" : "current");
  const [currentPickerLocation, setCurrentPickerLocation] = useState(null);
  const [pickerStatus, setPickerStatus] = useState("");
  const [pickerBusy, setPickerBusy] = useState(false);
  const [oneKmMeasurementPreview, setOneKmMeasurementPreview] = useState(null);
  const [oneKmPreviewState, setOneKmPreviewState] = useState("idle");
  const mapCenterRef = useRef(null);
  const userLocationRef = useRef(null);
  const lastPublishedCenterRef = useRef(null);
  const mapCenterPublishTimerRef = useRef(null);
  const weatherPositionRef = useRef(null);
  const lastWeatherRefreshAtRef = useRef(0);
  const weatherRefreshTimerRef = useRef(null);
  const liveAreaPositionRef = useRef(null);
  const liveAreaRefreshTimerRef = useRef(null);
  const lastLiveAreaRefreshAtRef = useRef(0);
  const searchRequestRef = useRef(0);
  const sosDetectionRequestRef = useRef(0);
  const initialDestinationHandledRef = useRef("");
  const activeOperatorToastAtRef = useRef(0);
  const oneKmPreviewRequestRef = useRef(0);
  const isOneKmPreview = mode === "oneKmPreview";
  const isBusinessLocationPicker = mode === "businessLocationPicker";
  const isSpecialMode = isOneKmPreview || isBusinessLocationPicker;
  const resolvedPickerLabels = useMemo(
    () => ({
      historyKey: "area-view-location-picker",
      backLabel: "Back to location form",
      eyebrow: "UrMall location",
      headerCurrentTitle: "Confirm current location",
      headerDropTitle: "Drop a pin",
      cardEyebrow: "Business address",
      currentHeading: "Your current location",
      dropHeading: "Place the pin on your business",
      dropInstruction: "Move the map until the pin sits exactly on the business entrance or pickup point, then add the location.",
      currentPreparing: "Your current location is being prepared.",
      currentStatus: "Confirming your current location...",
      dropStatus: "Move the map until the pin is exactly on the selected location.",
      currentName: "Current location",
      droppedName: "Pinned location",
      ...pickerLabels,
    }),
    [pickerLabels],
  );
  const areaAddLocationPickerLabels = useMemo(
    () => ({
      historyKey: "area-view-add-location-pin",
      backLabel: "Back to add location",
      eyebrow: "Area View",
      headerCurrentTitle: "Locate me",
      headerDropTitle: "Drop a pin",
      cardEyebrow: "New location",
      currentHeading: "Your current location",
      dropHeading: "Place the pin on the missing location",
      dropInstruction: "Move the map until the pin sits exactly on the place entrance, pickup point, or landmark. Then add the location to the form.",
      currentPreparing: "Your current location is being prepared.",
      currentStatus: "Confirming your current location...",
      dropStatus: "Move the map until the pin is exactly on the missing location.",
      currentName: "Current location",
      droppedName: "Pinned location",
    }),
    [],
  );

  const displayLocations = useMemo(() => {
    const ids = new Set();
    return [...nearbyLocations, ...liveLocations].filter((location) => {
      if (!location?.id || ids.has(location.id)) return false;
      ids.add(location.id);
      return true;
    });
  }, [liveLocations]);

  const filteredLocations = useMemo(() => {
    if (activeCategory === "All") return displayLocations;
    return displayLocations.filter((location) => location.category === activeCategory);
  }, [activeCategory, displayLocations]);

  const shouldShowFleetLayer = activeCategory === "All" || activeCategory === "Fleets";
  const operatorLocations = useMemo(
    () => (shouldShowFleetLayer ? liveOperators : []),
    [liveOperators, shouldShowFleetLayer],
  );
  const smartTrafficSnapshots = useMemo(
    () =>
      buildTrafficIntelligence({
        snapshots: trafficSnapshots,
        reports: liveReports,
        operators: liveOperators,
      }),
    [liveOperators, liveReports, trafficSnapshots],
  );

  const filteredMapLocations = useMemo(
    () => filteredLocations.filter((location) => location?.lat != null && location?.lng != null),
    [filteredLocations],
  );
  const selectedMoreCategory = moreLocationCategories.includes(activeCategory);
  const initialDestinationKey = useMemo(() => {
    if (!initialDestination) return "";
    return [
      initialDestination.type,
      initialDestination.id,
      getInitialDestinationSearchText(initialDestination),
      initialDestination.lat ?? initialDestination.latitude,
      initialDestination.lng ?? initialDestination.longitude,
      initialDestination.routePlan?.id,
      autoRoute ? "route" : "view",
    ].join(":");
  }, [autoRoute, initialDestination]);

  function readCachedSosCountryCode() {
    try {
      return String(localStorage.getItem(SOS_COUNTRY_CACHE_KEY) || "").toUpperCase();
    } catch {
      return "";
    }
  }

  function chooseLocationCategory(category) {
    setActiveCategory(category);
    setMoreCategoriesOpen(false);
  }

  const showNoActiveOperatorToast = useCallback(() => {
    if (isSpecialMode) return;

    const now = Date.now();
    if (now - activeOperatorToastAtRef.current < ACTIVE_OPERATOR_EMPTY_TOAST_COOLDOWN_MS) return;

    activeOperatorToastAtRef.current = now;
    showToast(ACTIVE_OPERATOR_EMPTY_TOAST_MESSAGE, "info");
  }, [isSpecialMode]);

  const publishLiveOperators = useCallback(
    (operators = []) => {
      const nextOperators = Array.isArray(operators)
        ? operators.filter((operator) => operator?.id && operator?.lat != null && operator?.lng != null)
        : [];

      setLiveOperators(nextOperators);

      if (!nextOperators.length) {
        showNoActiveOperatorToast();
      }
    },
    [showNoActiveOperatorToast],
  );

  useEffect(() => {
    if (activeCategory === "Fleets" && liveOperators.length === 0) {
      showNoActiveOperatorToast();
    }
  }, [activeCategory, liveOperators.length, showNoActiveOperatorToast]);

  useEffect(() => {
    if (!isOneKmPreview || !userLocation?.lat || !userLocation?.lng) {
      oneKmPreviewRequestRef.current += 1;
      setOneKmMeasurementPreview(null);
      setOneKmPreviewState("idle");
      return undefined;
    }

    let cancelled = false;
    const requestId = oneKmPreviewRequestRef.current + 1;
    oneKmPreviewRequestRef.current = requestId;

    setOneKmMeasurementPreview(null);
    setOneKmPreviewState("loading");

    buildRoadOneKmPreview(userLocation)
      .then((roadPreview) => {
        if (cancelled || oneKmPreviewRequestRef.current !== requestId) return;

        if (roadPreview) {
          setOneKmMeasurementPreview(roadPreview);
          setOneKmPreviewState("road");
          return;
        }

        setOneKmMeasurementPreview(buildStraightOneKmPreview(userLocation));
        setOneKmPreviewState("straight");
      })
      .catch(() => {
        if (cancelled || oneKmPreviewRequestRef.current !== requestId) return;
        setOneKmMeasurementPreview(buildStraightOneKmPreview(userLocation));
        setOneKmPreviewState("straight");
      });

    return () => {
      cancelled = true;
    };
  }, [isOneKmPreview, userLocation]);

  function cacheSosCountryCode(countryCode) {
    const normalizedCode = String(countryCode || "").toUpperCase();
    if (!normalizedCode) return;

    try {
      localStorage.setItem(SOS_COUNTRY_CACHE_KEY, normalizedCode);
    } catch {
      // Local storage may be blocked; SOS should still work.
    }
  }

  const handleMapLocationResolved = useCallback((position) => {
    const nextPosition = normalizePosition(position);
    if (!nextPosition) return;

    userLocationRef.current = nextPosition;
    mapCenterRef.current = nextPosition;

    const previousPosition = lastPublishedCenterRef.current;
    const movedMeters = distanceInMeters(previousPosition, nextPosition);
    if (previousPosition && movedMeters < MAP_CENTER_PUBLISH_METERS) return;

    if (mapCenterPublishTimerRef.current) {
      window.clearTimeout(mapCenterPublishTimerRef.current);
    }

    mapCenterPublishTimerRef.current = window.setTimeout(() => {
      lastPublishedCenterRef.current = nextPosition;
      setUserLocation(nextPosition);
      setMapCenter(nextPosition);
      mapCenterPublishTimerRef.current = null;
    }, MAP_CENTER_PUBLISH_DEBOUNCE_MS);
  }, []);

  useEffect(() => {
    return () => {
      if (mapCenterPublishTimerRef.current) window.clearTimeout(mapCenterPublishTimerRef.current);
      if (weatherRefreshTimerRef.current) window.clearTimeout(weatherRefreshTimerRef.current);
      if (liveAreaRefreshTimerRef.current) window.clearTimeout(liveAreaRefreshTimerRef.current);
      searchRequestRef.current += 1;
    };
  }, []);

  useEffect(() => {
    if (!isBusinessLocationPicker) return;
    setBusinessPickerMode(pickerStart === "dropPin" ? "dropPin" : "current");
    setPickerStatus("");
    setCurrentPickerLocation(null);
  }, [isBusinessLocationPicker, pickerStart]);

  useEffect(() => {
    if (!isBusinessLocationPicker || businessPickerMode !== "current" || !userLocation?.lat || !userLocation?.lng) {
      return undefined;
    }

    let cancelled = false;
    setPickerBusy(true);
    setPickerStatus(resolvedPickerLabels.currentStatus);

    reverseGeocodePoint(userLocation)
      .then((location) => {
        if (cancelled) return;
        const nextLocation = {
          ...location,
          name: resolvedPickerLabels.currentName,
          label: location.address,
          coordinatesLabel: formatCoordinatesLabel(location),
        };
        setCurrentPickerLocation(nextLocation);
        setPickerStatus(`Your current location is ${nextLocation.address}.`);
      })
      .finally(() => {
        if (!cancelled) setPickerBusy(false);
      });

    return () => {
      cancelled = true;
    };
  }, [businessPickerMode, isBusinessLocationPicker, resolvedPickerLabels.currentName, resolvedPickerLabels.currentStatus, userLocation]);

  useEffect(() => {
    const incomingRoutePlan = initialDestination?.routePlan;
    const destination = buildInitialMapDestination(initialDestination);
    const searchText = getInitialDestinationSearchText(initialDestination);
    if (!incomingRoutePlan && !destination && !searchText) return;
    if (initialDestinationHandledRef.current === initialDestinationKey) return;

    initialDestinationHandledRef.current = initialDestinationKey;

    if (incomingRoutePlan) {
      let cancelled = false;
      const searchCenter = mapCenterRef.current || userLocationRef.current || incomingRoutePlan.pickup || incomingRoutePlan.dropoff;

      setSearching(true);
      setSelectionLocked(false);
      setSearchResults([]);
      setLocationPanelOpen(false);
      setSearchOverlayOpen(false);

      Promise.all([
        resolveRouteWaypoint(incomingRoutePlan.pickup, searchCenter, "Pick up point"),
        resolveRouteWaypoint(incomingRoutePlan.dropoff, searchCenter, "Drop off point"),
      ])
        .then(([pickup, dropoff]) => {
          if (cancelled) return;
          if (!pickup || !dropoff) {
            throw new Error("Unable to resolve the passenger route");
          }

          const nextRoutePlan = {
            ...incomingRoutePlan,
            pickup,
            dropoff,
          };

          setOperatorRoutePlan(nextRoutePlan);
          setActiveLocation(dropoff);
          setSearchQuery(dropoff.address || dropoff.name);
          setSelectionLocked(true);
          setSelectedSearchLocation(dropoff);

          mapInstance?.flyTo({
            center: [dropoff.lng, dropoff.lat],
            zoom: 14,
            essential: true,
          });
        })
        .catch(() => {
          if (cancelled) return;
          setOperatorRoutePlan(null);
          setSearchQuery(searchText);
          setSearchResults([]);
          setSearchOverlayOpen(true);
        })
        .finally(() => {
          if (!cancelled) setSearching(false);
        });

      return () => {
        cancelled = true;
      };
    }

    setOperatorRoutePlan(null);

    if (!destination) {
      setSearchQuery(searchText);
      setSelectionLocked(false);
      setSearchResults([]);
      setSearching(true);
      setLocationPanelOpen(false);
      setSearchOverlayOpen(false);

      let cancelled = false;
      const searchCenter = mapCenterRef.current || userLocationRef.current;

      searchLocations(searchText, searchCenter)
        .then((results) => {
          if (cancelled) return;

          const result = Array.isArray(results) ? results[0] : null;
          if (!Number.isFinite(Number(result?.lat)) || !Number.isFinite(Number(result?.lng))) {
            setSearchResults([]);
            setSearchOverlayOpen(true);
            return;
          }

          const resolvedDestination = {
            ...result,
            id: result.id || `destination-${result.lat}-${result.lng}`,
            type: initialDestination?.type || "destination",
            name: result.name || searchText,
            category: initialDestination?.category || "Destination",
            address: result.address || result.name || searchText,
            distance: initialDestination?.distance || "Resolved from Area View search",
            status: initialDestination?.status || "verified",
            description: initialDestination?.description || "Selected destination from KunThai transport.",
          };

          setActiveLocation(resolvedDestination);
          setSearchQuery(resolvedDestination.name);
          setSelectionLocked(true);
          setSearchResults([]);
          setLocationPanelOpen(false);
          setSearchOverlayOpen(false);
          if (autoRoute) setSelectedSearchLocation(resolvedDestination);

          saveSearchHistory({ query: searchText, result: resolvedDestination, selected: true }).then(() => {
            getRecentSearchHistory().then(setRecentSearches);
          });

          mapInstance?.flyTo({
            center: [resolvedDestination.lng, resolvedDestination.lat],
            zoom: 15.5,
            essential: true,
          });
        })
        .catch(() => {
          if (cancelled) return;
          setSearchResults([]);
          setSearchOverlayOpen(true);
        })
        .finally(() => {
          if (!cancelled) setSearching(false);
        });

      return () => {
        cancelled = true;
      };
    }

    setActiveLocation(destination);
    setSearchQuery(destination.name);
    setSelectionLocked(true);
    setSearchResults([]);
    setSearching(false);
    setLocationPanelOpen(false);
    setSearchOverlayOpen(false);
    if (autoRoute) setSelectedSearchLocation(destination);

    mapInstance?.flyTo({
      center: [destination.lng, destination.lat],
      zoom: 15.5,
      essential: true,
    });
  }, [autoRoute, initialDestination, initialDestinationKey, mapInstance]);

  useEffect(() => {
    let mounted = true;

    async function loadLiveAreaData() {
      const initialWeatherPosition = mapCenterRef.current || userLocationRef.current || null;
      const areaOptions = { center: initialWeatherPosition, radiusKm: LIVE_AREA_RADIUS_KM };
      const [locations, operators, reports, traffic, history, weather] = await Promise.all([
        getApprovedNearbyLocations(areaOptions),
        getActiveTransportOperators(areaOptions),
        getActiveAreaReports(areaOptions),
        getActiveTrafficSnapshots(areaOptions),
        getRecentSearchHistory(),
        getWeatherCacheNearArea(initialWeatherPosition),
      ]);

      if (!mounted) return;
      setLiveLocations(locations);
      publishLiveOperators(operators);
      setLiveReports(reports);
      setTrafficSnapshots(traffic);
      setRecentSearches(history);
      setWeatherCache(weather);
      weatherPositionRef.current = initialWeatherPosition;
      liveAreaPositionRef.current = initialWeatherPosition;
      lastLiveAreaRefreshAtRef.current = Date.now();
      lastWeatherRefreshAtRef.current = Date.now();
    }

    loadLiveAreaData();

    const unsubscribe = subscribeToAreaViewLiveData({
      onLocations: (locations) => mounted && setLiveLocations(locations),
      onOperators: (operators) => mounted && publishLiveOperators(operators),
      onReports: (reports) => mounted && setLiveReports(reports),
      onTraffic: (traffic) => mounted && setTrafficSnapshots(traffic),
      onWeather: (weather) => mounted && setWeatherCache(weather),
      getArea: () => ({
        center: mapCenterRef.current || userLocationRef.current || liveAreaPositionRef.current,
        radiusKm: LIVE_AREA_RADIUS_KM,
      }),
    });

    return () => {
      mounted = false;
      unsubscribe?.();
    };
  }, [publishLiveOperators]);

  useEffect(() => {
    const expiryTimer = window.setInterval(() => {
      setLiveReports((items) => items.filter((item) => isFutureOrMissing(item.expiresAt)));
      setTrafficSnapshots((items) => items.filter((item) => isFutureOrMissing(item.expiresAt)));
    }, 60000);

    return () => window.clearInterval(expiryTimer);
  }, []);

  useEffect(() => {
    const nextPosition = normalizePosition(mapCenter);
    if (!nextPosition) return;

    const previousWeatherPosition = weatherPositionRef.current;
    const movedMeters = distanceInMeters(previousWeatherPosition, nextPosition);
    const now = Date.now();
    const recentlyRefreshed = now - lastWeatherRefreshAtRef.current < WEATHER_REFRESH_MS;
    const previousLiveAreaPosition = liveAreaPositionRef.current;
    const liveAreaMovedMeters = distanceInMeters(previousLiveAreaPosition, nextPosition);
    const liveAreaRefreshDue = now - lastLiveAreaRefreshAtRef.current >= LIVE_AREA_REFRESH_MS;
    const shouldRefreshLiveArea =
      !previousLiveAreaPosition || liveAreaMovedMeters >= LIVE_AREA_REFRESH_METERS || liveAreaRefreshDue;

    if (shouldRefreshLiveArea && !liveAreaRefreshTimerRef.current) {
      liveAreaRefreshTimerRef.current = window.setTimeout(async () => {
        const areaOptions = { center: nextPosition, radiusKm: LIVE_AREA_RADIUS_KM };
        const [locations, operators, reports, traffic] = await Promise.all([
          getApprovedNearbyLocations(areaOptions),
          getActiveTransportOperators(areaOptions),
          getActiveAreaReports(areaOptions),
          getActiveTrafficSnapshots(areaOptions),
        ]);

        setLiveLocations(locations);
        publishLiveOperators(operators);
        setLiveReports(reports);
        setTrafficSnapshots(traffic);
        liveAreaPositionRef.current = nextPosition;
        lastLiveAreaRefreshAtRef.current = Date.now();
        liveAreaRefreshTimerRef.current = null;
      }, 1200);
    }

    if (previousWeatherPosition && movedMeters < WEATHER_REFRESH_METERS && recentlyRefreshed) return;

    if (weatherRefreshTimerRef.current) {
      window.clearTimeout(weatherRefreshTimerRef.current);
    }

    weatherRefreshTimerRef.current = window.setTimeout(async () => {
      const weather = await getWeatherCacheNearArea(nextPosition);
      setWeatherCache(weather);
      weatherPositionRef.current = nextPosition;
      lastWeatherRefreshAtRef.current = Date.now();
      weatherRefreshTimerRef.current = null;
    }, WEATHER_REFRESH_DEBOUNCE_MS);

    return () => {
      if (weatherRefreshTimerRef.current) {
        window.clearTimeout(weatherRefreshTimerRef.current);
        weatherRefreshTimerRef.current = null;
      }
    };
  }, [mapCenter, publishLiveOperators]);

  useEffect(() => {
    const requestId = searchRequestRef.current + 1;
    searchRequestRef.current = requestId;

    const timeout = window.setTimeout(async () => {
      if (!searchOverlayOpen) {
        if (searchRequestRef.current === requestId) setSearching(false);
        return;
      }

      if (selectionLocked) {
        if (searchRequestRef.current === requestId) {
          setSearchResults([]);
          setSearching(false);
        }
        return;
      }

      const text = searchQuery.trim();

      if (text.length < 2) {
        if (searchRequestRef.current === requestId) {
          setSearchResults([]);
          setSearching(false);
        }
        return;
      }

      setSearching(true);

      try {
        const searchCenter = mapCenterRef.current || userLocationRef.current;
        const results = await searchLocations(text, searchCenter);
        if (searchRequestRef.current !== requestId) return;
        setSearchResults(results || []);
      } catch {
        if (searchRequestRef.current !== requestId) return;
        setSearchResults([]);
      } finally {
        if (searchRequestRef.current === requestId) {
          setSearching(false);
        }
      }
    }, 350);

    return () => window.clearTimeout(timeout);
  }, [searchOverlayOpen, searchQuery, selectionLocked]);

  const openAddLocation = useCallback(() => {
    setLocationPanelOpen(false);
    setAddLocationDraft(createAddLocationDraft());
    setAddLocationMode("form");
    setAddLocationStatus("Use Locate Me or Drop Pin so the new location can be reviewed with an exact map point.");
    setAddLocationLocateCautionOpen(false);
    setAddLocationBusy(false);
    setFocusMode(false);
    setAdding(true);
  }, []);

  const updateAddLocationDraft = useCallback((field, value) => {
    setAddLocationDraft((current) => ({ ...current, [field]: value }));
  }, []);

  const closeAddLocation = useCallback(() => {
    setAdding(false);
    setAddLocationMode("form");
    setAddLocationLocateCautionOpen(false);
    setAddLocationStatus("");
    setAddLocationBusy(false);
    setFocusMode(false);
  }, []);

  const handleAddLocationBack = useCallback(() => {
    if (addLocationMode === "dropPin") {
      setAddLocationMode("form");
      setFocusMode(false);
      setAddLocationStatus("Review the pinned address, then submit when the details are correct.");
      return;
    }

    closeAddLocation();
  }, [addLocationMode, closeAddLocation]);

  const startAddLocationDropPin = useCallback(() => {
    setAddLocationLocateCautionOpen(false);
    setAdding(true);
    setAddLocationMode("dropPin");
    setFocusMode(true);
    setAddLocationStatus(areaAddLocationPickerLabels.dropStatus);
  }, [areaAddLocationPickerLabels.dropStatus]);

  const confirmAddLocationLocateMe = useCallback(async () => {
    setAddLocationLocateCautionOpen(false);
    setAddLocationBusy(true);
    setAddLocationStatus("Requesting your exact device location...");

    try {
      const position = await getBrowserCurrentPosition();
      const point = {
        lat: position.coords.latitude,
        lng: position.coords.longitude,
        accuracyMeters: position.coords.accuracy,
      };

      userLocationRef.current = point;
      mapCenterRef.current = point;
      setUserLocation(point);
      setMapCenter(point);
      setRecenterSignal((value) => value + 1);
      mapInstance?.flyTo({
        center: [point.lng, point.lat],
        zoom: 17,
        essential: true,
      });

      const location = await reverseGeocodePoint(point);
      const coordinatesLabel = formatCoordinatesLabel(location);
      setAddLocationDraft((current) => ({
        ...current,
        address: location.address || current.address,
        lat: location.lat,
        lng: location.lng,
        coordinatesLabel,
        source: "currentLocation",
      }));
      setAddLocationStatus(`Your current location is ${location.address}. ${coordinatesLabel ? `Coordinates: ${coordinatesLabel}.` : ""}`);
    } catch (error) {
      setAddLocationStatus(error?.message || "Location permission is needed, or you can use Drop Pin instead.");
    } finally {
      setAddLocationBusy(false);
    }
  }, [mapInstance]);

  const confirmAddLocationDroppedPin = useCallback(async () => {
    const center = mapInstance?.getCenter?.();
    const point = center
      ? { lat: center.lat, lng: center.lng }
      : mapCenterRef.current || userLocationRef.current || userLocation;

    if (!Number.isFinite(Number(point?.lat)) || !Number.isFinite(Number(point?.lng))) {
      setAddLocationStatus("Move the map to the exact location, then add the location.");
      return;
    }

    setAddLocationBusy(true);
    setAddLocationStatus("Reading the pinned map location...");

    try {
      const location = await reverseGeocodePoint(point);
      const coordinatesLabel = formatCoordinatesLabel(location);
      setAddLocationDraft((current) => ({
        ...current,
        address: location.address || current.address,
        lat: location.lat,
        lng: location.lng,
        coordinatesLabel,
        source: "dropPin",
      }));
      setAddLocationMode("form");
      setFocusMode(false);
      setAddLocationStatus(`Pinned location added to the form. ${coordinatesLabel ? `Coordinates: ${coordinatesLabel}.` : ""}`);
    } catch (error) {
      setAddLocationStatus(error?.message || "Unable to read the pinned location. Try again.");
    } finally {
      setAddLocationBusy(false);
    }
  }, [mapInstance, userLocation]);

  const submitAddLocationForReview = useCallback(async () => {
    const category = addLocationDraft.category === "Other"
      ? addLocationDraft.categoryName.trim()
      : addLocationDraft.category;

    if (!addLocationDraft.name.trim()) {
      setAddLocationStatus("Enter the place name before submitting.");
      return;
    }

    if (!category) {
      setAddLocationStatus("Choose or enter a category before submitting.");
      return;
    }

    if (!Number.isFinite(Number(addLocationDraft.lat)) || !Number.isFinite(Number(addLocationDraft.lng))) {
      setAddLocationStatus("Use Locate Me or Drop Pin before submitting so the location has an exact map point.");
      return;
    }

    setAddLocationBusy(true);
    setAddLocationStatus("Submitting this location for KunThai review...");

    try {
      const submitted = await submitNearbyAreaLocation({
        ...addLocationDraft,
        category,
      });
      const pendingLocation = {
        ...submitted,
        id: submitted.id || `submitted-${Date.now()}`,
        name: submitted.name || addLocationDraft.name,
        category: submitted.category || category,
        type: submitted.type || category,
        status: "community",
        visibility: "pending",
        description: submitted.description || addLocationDraft.description || "Submitted for KunThai review.",
        distance: submitted.address || addLocationDraft.address || "Submitted for review",
        lat: submitted.lat ?? addLocationDraft.lat,
        lng: submitted.lng ?? addLocationDraft.lng,
      };

      setLiveLocations((items) => [pendingLocation, ...items.filter((item) => item.id !== pendingLocation.id)]);
      setActiveLocation(pendingLocation);
      setLocationPanelOpen(true);
      mapInstance?.flyTo({
        center: [pendingLocation.lng, pendingLocation.lat],
        zoom: 16,
        essential: true,
      });
      closeAddLocation();
    } catch (error) {
      setAddLocationStatus(error?.message || "Unable to submit this location for review.");
    } finally {
      setAddLocationBusy(false);
    }
  }, [addLocationDraft, closeAddLocation, mapInstance]);

  const handleUseCurrentArea = useCallback(() => {
    setFocusMode(false);
    setRecenterSignal((value) => value + 1);
  }, []);

  async function openEmergencyMode() {
    const requestId = sosDetectionRequestRef.current + 1;
    sosDetectionRequestRef.current = requestId;
    setSosOpen(true);

    const cachedCountryCode = readCachedSosCountryCode();
    if (cachedCountryCode) {
      setDetectedCountryCode(cachedCountryCode);
      setDetectingSosCountry(false);
      return;
    }

    const position = userLocationRef.current || mapCenterRef.current || userLocation || mapCenter;
    if (position?.lat == null || position?.lng == null) {
      setDetectedCountryCode(SOS_FALLBACK_COUNTRY);
      setDetectingSosCountry(false);
      return;
    }

    setDetectingSosCountry(true);

    const detected = await detectCountryFromCoords(position.lat, position.lng);
    const nextCountryCode = String(detected?.countryCode || SOS_FALLBACK_COUNTRY).toUpperCase();

    if (sosDetectionRequestRef.current !== requestId) {
      return;
    }

    setDetectedCountryCode(nextCountryCode);
    cacheSosCountryCode(nextCountryCode);
    setDetectingSosCountry(false);
  }

  const handleEmergencyNearbySearch = useCallback((type) => {
    const searchMap = {
      hospital: "hospital near me",
      police: "police station near me",
      pharmacy: "pharmacy near me",
      fire: "fire station near me",
    };

    const query = searchMap[type] || `${type} near me`;

    setSosOpen(false);
    setOperatorRoutePlan(null);
    setSelectionLocked(false);
    setSearchResults([]);
    setSearching(false);
    setSearchQuery(query);
    setSearchOverlayOpen(true);
  }, []);

  function handleEmergencySheetClose() {
    sosDetectionRequestRef.current += 1;
    setSosOpen(false);
    if (detectingSosCountry) {
      setDetectingSosCountry(false);
    }
  }

  const handleSelectSearchResult = useCallback((result) => {
    saveSearchHistory({ query: searchQuery || result.name, result, selected: true }).then(() => {
      getRecentSearchHistory().then(setRecentSearches);
    });
    setSelectionLocked(true);
    setSearchQuery(result.name);
    setSearchResults([]);
    setSearching(false);
    setLocationPanelOpen(false);
    setSearchOverlayOpen(false);
    setOperatorRoutePlan(null);
    setSelectedSearchLocation(result);

    if (document.activeElement) document.activeElement.blur();

    mapInstance?.flyTo({
      center: [result.lng, result.lat],
      zoom: 15.5,
      essential: true,
    });
  }, [mapInstance, searchQuery]);

  const handleDeleteRecentSearch = useCallback(async (historyId) => {
    setRecentSearches((items) => items.filter((item) => item.id !== historyId));
    const deleted = await deleteNearbySearchHistory(historyId);
    if (!deleted) {
      getRecentSearchHistory().then(setRecentSearches);
    }
  }, []);

  const handleSelectLiveLocation = useCallback((location) => {
    setActiveLocation(location);
    setLocationPanelOpen(true);
    setOperatorRoutePlan(null);
    setSelectedSearchLocation(location);

    mapInstance?.flyTo({
      center: [location.lng, location.lat],
      zoom: 15.5,
      essential: true,
    });
  }, [mapInstance]);

  const handleSelectReport = useCallback((report) => {
    setActiveLocation({
      id: report.id,
      name: report.title,
      type: report.type,
      category: "Emergency",
      distance: report.roadName || "Live report",
      status: report.severity === "critical" || report.severity === "high" ? "urgent" : "community",
      description: report.description,
      lat: report.lat,
      lng: report.lng,
    });
    setLocationPanelOpen(true);
  }, []);

  const handlePinnedLocationSelect = useCallback((location) => {
    setActiveLocation(location);
    setLocationPanelOpen(true);
  }, []);

  const handleAddCurrentPickerLocation = useCallback(() => {
    if (!currentPickerLocation) return;
    onLocationPicked?.(currentPickerLocation);
  }, [currentPickerLocation, onLocationPicked]);

  const handleAddDroppedPinLocation = useCallback(async () => {
    const center = mapInstance?.getCenter?.();
    const point = center
      ? { lat: center.lat, lng: center.lng }
      : mapCenterRef.current || userLocationRef.current || userLocation;

    if (!point?.lat || !point?.lng) {
      setPickerStatus("Move the map to the exact location, then add the location.");
      return;
    }

    setPickerBusy(true);
    setPickerStatus("Reading the selected map location...");

    const location = await reverseGeocodePoint(point);
    setPickerBusy(false);
    onLocationPicked?.({
      ...location,
      name: resolvedPickerLabels.droppedName,
      label: location.address,
      coordinatesLabel: formatCoordinatesLabel(location),
      source: "dropPin",
    });
  }, [mapInstance, onLocationPicked, resolvedPickerLabels.droppedName, userLocation]);

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <section className="relative min-h-screen overflow-hidden">
        <NearbyAreaMap
          onLocationResolved={handleMapLocationResolved}
          onMapReady={setMapInstance}
          selectedLocation={isSpecialMode ? null : selectedSearchLocation}
          routePlan={operatorRoutePlan}
          focusMode={isSpecialMode ? true : focusMode}
          operatorLocations={isSpecialMode ? [] : operatorLocations}
          nearbyMapLocations={isSpecialMode ? [] : filteredMapLocations}
          reportLocations={isSpecialMode ? [] : liveReports}
          trafficSnapshots={isSpecialMode ? [] : smartTrafficSnapshots}
          weatherCache={weatherCache}
          onMapLocationSelect={handleSelectLiveLocation}
          onReportSelect={handleSelectReport}
          recenterSignal={recenterSignal}
          measurementPreview={oneKmMeasurementPreview}
        >
          <div className="pointer-events-none absolute inset-0 z-10">
            {!isSpecialMode && !focusMode &&
              filteredLocations.map((location) => (
                <MapPinButton
                  key={location.id}
                  location={location}
                  active={activeLocation?.id === location.id}
                  onSelect={handlePinnedLocationSelect}
                />
              ))}
          </div>
        </NearbyAreaMap>

        {isOneKmPreview ? (
          <OneKmPreviewChrome
            onBack={onBack}
            onDone={onDone || onBack}
            backLabel={backLabel}
            ready={Boolean(oneKmMeasurementPreview)}
            previewState={oneKmPreviewState}
          />
        ) : null}

        {isBusinessLocationPicker ? (
          <BusinessLocationPickerChrome
            mode={businessPickerMode}
            status={pickerStatus}
            busy={pickerBusy}
            currentLocation={currentPickerLocation}
            labels={resolvedPickerLabels}
            onBack={onBack}
            onUseCurrent={handleAddCurrentPickerLocation}
            onDropPin={() => {
              setBusinessPickerMode("dropPin");
              setPickerStatus(resolvedPickerLabels.dropStatus);
            }}
            onAddDroppedPin={handleAddDroppedPinLocation}
          />
        ) : null}

        {!isSpecialMode && adding && addLocationMode === "dropPin" ? (
          <BusinessLocationPickerChrome
            mode="dropPin"
            status={addLocationStatus}
            busy={addLocationBusy}
            currentLocation={null}
            labels={areaAddLocationPickerLabels}
            onBack={handleAddLocationBack}
            onUseCurrent={() => setAddLocationLocateCautionOpen(true)}
            onDropPin={startAddLocationDropPin}
            onAddDroppedPin={confirmAddLocationDroppedPin}
          />
        ) : null}

        {!isSpecialMode && !(adding && addLocationMode === "dropPin") && (
        <header className="pointer-events-none absolute left-0 right-0 top-0 z-20 px-3 py-3 sm:px-5">
          <div className="pointer-events-auto flex items-center gap-2 sm:gap-3">
            <AppBackTab
              onBack={() => {
                if (mapLocked) return;
                onBack?.();
              }}
              label={mapLocked ? "Map locked" : backLabel}
              historyKey="transport-nearby-area"
              className={`h-12 w-12 rounded-2xl shadow-lg ${
                mapLocked ? "bg-slate-900 text-white opacity-70" : "bg-white/95 text-slate-900 hover:bg-white"
              }`}
              iconSize={22}
            />

            <button
              type="button"
              onClick={() => setSearchOverlayOpen(true)}
              className="flex h-12 min-w-0 flex-1 items-center gap-3 rounded-2xl bg-white/95 px-4 text-left text-slate-900 shadow-lg"
            >
              <FiSearch className="shrink-0 text-slate-400" size={20} />
              <span className="truncate text-sm font-black sm:text-base">
                {searchQuery || "Search street, shop, school, pickup point"}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setFocusMode((value) => !value)}
              className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl shadow-lg transition ${
                focusMode ? "bg-slate-950 text-white" : "bg-white/95 text-slate-900 hover:bg-white"
              }`}
              aria-label={focusMode ? "Exit focus mode" : "Enter focus mode"}
            >
              {focusMode ? <FiEyeOff size={21} /> : <FiEye size={21} />}
            </button>

            <button
              type="button"
              onClick={() => setMapLocked((value) => !value)}
              className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl shadow-lg transition ${
                mapLocked ? "bg-green-600 text-white" : "bg-white/95 text-slate-900 hover:bg-white"
              }`}
              aria-label={mapLocked ? "Unlock map screen" : "Lock map screen"}
            >
              {mapLocked ? <FiLock size={21} /> : <FiUnlock size={21} />}
            </button>

            <button
              type="button"
              onClick={openAddLocation}
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-green-600 text-white shadow-lg transition hover:bg-green-700"
              aria-label="Add location"
            >
              <FiPlus size={22} />
            </button>
          </div>

          {!focusMode && (
            <div className="pointer-events-auto relative mt-3">
              <div className="grid grid-cols-4 gap-2 sm:flex sm:flex-wrap">
                {primaryLocationCategories.map((category) => (
                  <button
                    key={category}
                    type="button"
                    onClick={() => chooseLocationCategory(category)}
                    className={`min-h-11 rounded-full px-3 text-sm font-black shadow sm:px-4 ${
                      activeCategory === category
                        ? "bg-green-600 text-white"
                        : "bg-slate-900/85 text-white backdrop-blur"
                    }`}
                  >
                    {category}
                  </button>
                ))}

                <button
                  type="button"
                  onClick={() => setMoreCategoriesOpen((open) => !open)}
                  aria-expanded={moreCategoriesOpen}
                  className={`flex min-h-11 items-center justify-center gap-1 rounded-full px-3 text-sm font-black shadow sm:px-4 ${
                    moreCategoriesOpen || selectedMoreCategory
                      ? "bg-green-600 text-white"
                      : "bg-slate-900/85 text-white backdrop-blur"
                  }`}
                >
                  More
                  {moreCategoriesOpen ? <FiChevronUp size={16} /> : <FiChevronDown size={16} />}
                </button>
              </div>

              {moreCategoriesOpen ? (
                <div className="absolute left-0 top-full z-40 mt-2 grid w-full max-w-[min(19rem,calc(100vw-1.5rem))] gap-2 rounded-3xl border border-white/40 bg-white/95 p-2 text-slate-950 shadow-2xl backdrop-blur">
                  {moreLocationCategories.map((category) => (
                    <button
                      key={category}
                      type="button"
                      onClick={() => chooseLocationCategory(category)}
                      className={`flex h-11 items-center justify-between rounded-2xl px-4 text-left text-sm font-black transition ${
                        activeCategory === category
                          ? "bg-green-600 text-white"
                          : "bg-slate-100 text-slate-800 hover:bg-slate-200"
                      }`}
                    >
                      <span>{category}</span>
                      {activeCategory === category ? <span className="h-2.5 w-2.5 rounded-full bg-white" /> : null}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          )}
        </header>
        )}

        {!isSpecialMode && !focusMode && (
          <div className="area-view-side-actions absolute right-3 z-30 grid gap-3 sm:right-5">
            <button
              type="button"
              onClick={openEmergencyMode}
              className="kt-pressable flex h-12 w-12 items-center justify-center rounded-full bg-red-600 text-white shadow-xl"
              aria-label="Open KunThai SOS"
            >
              <FiAlertTriangle size={22} />
            </button>

            <button
              type="button"
              onClick={handleUseCurrentArea}
              className="kt-pressable flex h-12 w-12 items-center justify-center rounded-full bg-slate-950/90 text-white shadow-xl"
              aria-label="Return to current location"
            >
              <FiCrosshair size={22} />
            </button>

            <button
              type="button"
              className="kt-pressable flex h-12 w-12 items-center justify-center rounded-full bg-white text-slate-900 shadow-xl"
              aria-label="Save current area"
            >
              <FiBookmark size={22} />
            </button>
          </div>
        )}

        {!isSpecialMode && !focusMode && (
          <LocationPanel
            activeLocation={activeLocation}
            open={locationPanelOpen}
            onClose={() => setLocationPanelOpen(false)}
            onAddLocation={openAddLocation}
          />
        )}

        {!isSpecialMode && searchOverlayOpen && (
          <SearchOverlay
            query={searchQuery}
            setQuery={(value) => {
              setSelectionLocked(false);
              setSearchQuery(value);
            }}
            searching={searching}
            results={searchResults}
            onClose={() => setSearchOverlayOpen(false)}
            onSelect={handleSelectSearchResult}
            onUseCurrentLocation={handleUseCurrentArea}
            recentSearches={recentSearches}
            onDeleteRecentSearch={handleDeleteRecentSearch}
          />
        )}

        {!isSpecialMode && adding && addLocationMode === "form" ? (
          <AddLocationPanel
            draft={addLocationDraft}
            busy={addLocationBusy}
            cautionOpen={addLocationLocateCautionOpen}
            status={addLocationStatus}
            onBack={handleAddLocationBack}
            onChange={updateAddLocationDraft}
            onCloseCaution={() => setAddLocationLocateCautionOpen(false)}
            onDropPin={startAddLocationDropPin}
            onLocateMe={() => setAddLocationLocateCautionOpen(true)}
            onConfirmLocateMe={confirmAddLocationLocateMe}
            onSubmit={submitAddLocationForReview}
          />
        ) : null}

        <EmergencySheet
          open={sosOpen}
          onClose={handleEmergencySheetClose}
          countryCode={detectedCountryCode}
          detectingCountry={detectingSosCountry}
          onNavigateNearby={handleEmergencyNearbySearch}
        />
      </section>
    </div>
  );
}

function OneKmPreviewChrome({ onBack, onDone, backLabel, ready, previewState }) {
  const { collapsed, toggle } = useAutoCollapseCard({
    resetKey: ready ? "one-km-ready" : "one-km-waiting",
  });
  const statusText =
    previewState === "loading"
      ? "Finding a nearby road route for the 1 km preview..."
      : previewState === "straight"
        ? "No usable nearby road route was available, so this view falls back to a straight 1 km distance."
        : "The green route follows nearby roads for the first 1 km so you can price each kilometre with confidence.";

  return (
    <>
      <header className="pointer-events-none absolute left-0 right-0 top-0 z-30 px-3 py-3 sm:px-5">
        <div className="pointer-events-auto flex items-center gap-3 rounded-3xl bg-white/95 px-3 py-2 text-slate-950 shadow-xl backdrop-blur sm:max-w-md">
          <AppBackTab
            onBack={onBack}
            label={backLabel}
            historyKey="transport-one-km-preview"
            useHistoryLayer={false}
            className="bg-white text-slate-900"
            iconSize={22}
          />
          <div className="min-w-0">
            <p className="text-xs font-black uppercase text-green-700">Price guide</p>
            <h1 className="truncate text-base font-black">1 KM preview</h1>
          </div>
        </div>
      </header>

      {collapsed ? (
        <div className="absolute bottom-5 right-4 z-30 sm:right-5">
          <MapCardCollapseButton
            collapsed
            label="Maximize distance view"
            onClick={toggle}
          />
        </div>
      ) : (
      <section className="absolute bottom-4 left-3 right-3 z-30 rounded-3xl bg-white/95 p-4 text-slate-950 shadow-2xl backdrop-blur transition-all duration-300 sm:bottom-5 sm:left-auto sm:right-5 sm:w-[390px]">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-black uppercase text-green-700">Distance view</p>
            <h2 className="mt-1 text-xl font-black leading-tight">One kilometre from your current location</h2>
          </div>
          <MapCardCollapseButton
            label="Minimize distance view"
            onClick={toggle}
          />
        </div>

        <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">{statusText}</p>
        {!ready ? (
          <p className="mt-3 rounded-2xl bg-green-50 px-3 py-2 text-xs font-black text-green-700">
            {previewState === "loading" ? "Checking nearby roads..." : "Waiting for your current location..."}
          </p>
        ) : null}
        <button
          type="button"
          onClick={onDone}
          className="mt-4 h-11 w-full rounded-2xl bg-green-600 text-sm font-black text-white hover:bg-green-700"
        >
          Done
        </button>
      </section>
      )}
    </>
  );
}

function BusinessLocationPickerChrome({
  mode,
  status,
  busy,
  currentLocation,
  labels,
  onBack,
  onUseCurrent,
  onDropPin,
  onAddDroppedPin,
}) {
  const isDropPin = mode === "dropPin";
  const coordinates = currentLocation?.coordinatesLabel || formatCoordinatesLabel(currentLocation);
  const { collapsed, toggle } = useAutoCollapseCard({
    enabled: isDropPin,
    resetKey: [
      mode,
      busy ? "busy" : "ready",
      status,
      currentLocation?.address,
      currentLocation?.lat,
      currentLocation?.lng,
    ].join("|"),
  });

  return (
    <>
      <header className="pointer-events-none absolute left-0 right-0 top-0 z-30 px-3 py-3 sm:px-5">
        <div className="pointer-events-auto flex items-center gap-3 rounded-3xl bg-white/95 px-3 py-2 text-slate-950 shadow-xl backdrop-blur sm:max-w-lg">
          <AppBackTab
            onBack={onBack}
            label={labels.backLabel}
            historyKey={labels.historyKey}
            useHistoryLayer={false}
            className="bg-white text-slate-900"
            iconSize={22}
          />
          <div className="min-w-0">
            <p className="text-xs font-black uppercase text-blue-700">{labels.eyebrow}</p>
            <h1 className="truncate text-base font-black">
              {isDropPin ? labels.headerDropTitle : labels.headerCurrentTitle}
            </h1>
          </div>
        </div>
      </header>

      {isDropPin ? (
        <div className="pointer-events-none absolute inset-0 z-20 grid place-items-center">
          <div className="relative h-24 w-24">
            <div className="absolute left-1/2 top-0 -translate-x-1/2 rounded-full bg-blue-600 px-3 py-1 text-xs font-black text-white shadow-xl">
              PIN
            </div>
            <FiMapPin className="absolute left-1/2 top-8 -translate-x-1/2 text-blue-600 drop-shadow-xl" size={44} />
            <div className="absolute left-1/2 top-[4.7rem] h-3 w-3 -translate-x-1/2 rounded-full bg-blue-600/40" />
          </div>
        </div>
      ) : null}

      {collapsed ? (
        <div className="absolute bottom-5 right-4 z-30 sm:right-5">
          <MapCardCollapseButton
            collapsed
            label={isDropPin ? "Maximize drop pin card" : "Maximize location card"}
            onClick={toggle}
          />
        </div>
      ) : (
        <section className="absolute bottom-4 left-3 right-3 z-30 rounded-3xl bg-white/95 p-4 text-slate-950 shadow-2xl backdrop-blur sm:bottom-5 sm:left-auto sm:right-5 sm:w-[420px]">
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-xs font-black uppercase text-blue-700">{labels.cardEyebrow}</p>
              <h2 className="mt-1 text-xl font-black">
                {isDropPin ? labels.dropHeading : labels.currentHeading}
              </h2>
            </div>
            <MapCardCollapseButton
              label={isDropPin ? "Minimize drop pin card" : "Minimize location card"}
              onClick={toggle}
            />
          </div>
          <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">
            {isDropPin
              ? labels.dropInstruction
              : status || labels.currentPreparing}
          </p>
          {!isDropPin && currentLocation ? (
            <div className="mt-3 rounded-2xl border border-blue-100 bg-blue-50 px-3 py-3">
              <p className="text-sm font-black leading-5 text-blue-950">{currentLocation.address}</p>
              {coordinates ? <p className="mt-2 text-xs font-bold text-blue-700">{coordinates}</p> : null}
            </div>
          ) : null}
          {isDropPin && status ? (
            <p className="mt-3 rounded-2xl bg-blue-50 px-3 py-2 text-xs font-black text-blue-700">{status}</p>
          ) : null}
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            {isDropPin ? (
              <>
                <button
                  type="button"
                  onClick={onBack}
                  className="h-11 rounded-2xl border border-slate-200 text-sm font-black text-slate-700 hover:bg-slate-50"
                >
                  Back
                </button>
                <button
                  type="button"
                  onClick={onAddDroppedPin}
                  disabled={busy}
                  className="h-11 rounded-2xl bg-blue-600 text-sm font-black text-white hover:bg-blue-700 disabled:opacity-60"
                >
                  {busy ? "Adding..." : "Add location"}
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={onDropPin}
                  className="h-11 rounded-2xl border border-slate-200 text-sm font-black text-slate-700 hover:bg-slate-50"
                >
                  Drop a pin
                </button>
                <button
                  type="button"
                  onClick={onUseCurrent}
                  disabled={busy || !currentLocation}
                  className="h-11 rounded-2xl bg-blue-600 text-sm font-black text-white hover:bg-blue-700 disabled:opacity-60"
                >
                  Add location
                </button>
              </>
            )}
          </div>
        </section>
      )}
    </>
  );
}

function SearchOverlay({
  query,
  setQuery,
  searching,
  results,
  onClose,
  onSelect,
  onUseCurrentLocation,
  recentSearches = [],
  onDeleteRecentSearch,
}) {
  return (
    <div className="fixed inset-0 z-[1400] bg-slate-950/70 backdrop-blur-sm">
      <section className="mx-auto flex h-full w-full max-w-2xl flex-col bg-white text-slate-950 shadow-2xl sm:mt-4 sm:h-[calc(100vh-2rem)] sm:rounded-3xl">
        <div className="border-b border-slate-100 px-4 pb-3 pt-4">
          <div className="mx-auto mb-3 h-1.5 w-20 rounded-full bg-slate-300 sm:hidden" />

          <div className="flex items-center gap-3">
            <label className="relative min-w-0 flex-1">
              <FiSearch className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={23} />
              <input
                autoFocus
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search KunThai map"
                className="h-14 w-full rounded-2xl border border-slate-200 bg-slate-50 pl-12 pr-12 text-lg font-black text-slate-950 outline-none focus:border-green-500"
              />
              {query ? (
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  className="absolute right-3 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-slate-200 text-slate-700"
                >
                  <FiX size={18} />
                </button>
              ) : null}
            </label>

            <button
              type="button"
              onClick={onClose}
              className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-900"
              aria-label="Close search"
            >
              <FiX size={26} />
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
          {!query.trim() && recentSearches.length ? (
            <section className="mb-3 rounded-3xl bg-slate-50 p-3">
              <p className="mb-2 text-xs font-black uppercase tracking-wide text-slate-400">Recent searches</p>
              <div className="grid gap-2">
                {recentSearches.slice(0, 5).map((item) => {
                  const label = item.place_name || item.search_text;

                  return (
                    <div key={item.id} className="flex items-center gap-2 rounded-2xl bg-white px-3 py-2">
                      <button
                        type="button"
                        onClick={() =>
                          onSelect({
                            id: item.id,
                            name: label,
                            address: item.place_address,
                            category: item.category,
                            lat: item.lat,
                            lng: item.lng,
                          })
                        }
                        disabled={item.lat == null || item.lng == null}
                        className="flex min-w-0 flex-1 items-center gap-3 text-left disabled:opacity-50"
                      >
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-900 text-white">
                          <FiSearch size={16} />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-black text-slate-950">
                            {label}
                          </span>
                          <span className="block truncate text-xs font-bold text-slate-500">
                            {item.place_address || "Recent Area View search"}
                          </span>
                        </span>
                      </button>

                      <button
                        type="button"
                        onClick={() => onDeleteRecentSearch?.(item.id)}
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-500 transition hover:bg-red-50 hover:text-red-600"
                        aria-label={`Delete ${label} from recent searches`}
                      >
                        <FiX size={17} />
                      </button>
                    </div>
                  );
                })}
              </div>
            </section>
          ) : null}

          <button
            type="button"
            onClick={() => {
              onUseCurrentLocation();
              onClose();
            }}
            className="mb-3 flex w-full items-center gap-3 rounded-2xl border border-green-100 bg-green-50 px-4 py-3 text-left"
          >
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-green-600 text-white">
              <FiNavigation size={20} />
            </span>
            <span>
              <span className="block text-base font-black text-slate-950">Use current location</span>
              <span className="block text-sm font-bold text-slate-500">Return the map to your live position</span>
            </span>
          </button>

          {searching ? (
            <div className="rounded-2xl bg-slate-50 px-4 py-5 text-sm font-black text-slate-500">
              Searching nearby places...
            </div>
          ) : results.length ? (
            <div className="overflow-hidden rounded-3xl bg-white">
              {results.map((result) => (
                <button
                  key={result.id}
                  type="button"
                  onClick={() => onSelect(result)}
                  className="flex w-full gap-4 border-b border-slate-100 px-2 py-4 text-left hover:bg-slate-50"
                >
                  <span className="mt-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-rose-500 text-white">
                    <FiMapPin size={21} />
                  </span>

                  <span className="min-w-0 flex-1">
                    <span className="block break-words text-base font-black leading-5 text-slate-950 sm:text-lg">
                      {result.name}
                    </span>
                    <span className="mt-1 block break-words text-sm font-bold leading-5 text-slate-500 sm:text-base">
                      {result.distance ? `${result.distance} • ` : ""}
                      {getShortAddress(result)}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          ) : query.trim().length >= 2 ? (
            <div className="rounded-2xl bg-slate-50 px-4 py-5 text-sm font-black text-slate-500">
              No clear result found. Try a street, landmark, business name, or area.
            </div>
          ) : (
            <div className="rounded-2xl bg-slate-50 px-4 py-5 text-sm font-black text-slate-500">
              Start typing to search for roads, shops, schools, pickup points, and landmarks.
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

const MapPinButton = memo(function MapPinButton({ location, active, onSelect }) {
  if (!location?.position) return null;

  const isEmergency = location.category === "Emergency";

  return (
    <button
      type="button"
      onClick={() => onSelect(location)}
      className={`pointer-events-auto absolute -translate-x-1/2 -translate-y-1/2 rounded-full border-2 p-2 shadow-lg transition duration-200 hover:scale-105 ${
        active ? "scale-110 border-white bg-green-600" : "border-white/80 bg-slate-900"
      } ${isEmergency ? "text-red-300" : "text-white"}`}
      style={{ left: location.position.left, top: location.position.top }}
      aria-label={location.name}
    >
      {isEmergency ? <FiAlertTriangle size={18} /> : <FiMapPin size={18} />}
    </button>
  );
});
function LocationPanel({ activeLocation, open, onClose, onAddLocation }) {
  const status = locationStatusStyles[activeLocation?.status] || locationStatusStyles.community;

  if (!open) return null;

  return (
    <aside className="absolute left-3 right-3 top-36 z-30 max-h-[calc(100vh-10rem)] overflow-y-auto rounded-3xl bg-white/95 p-4 text-slate-950 shadow-2xl backdrop-blur sm:left-auto sm:right-5 sm:w-[390px]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Nearby Area</p>
          <h2 className="mt-1 text-xl font-black">{activeLocation?.name}</h2>
          <p className="mt-1 text-sm text-slate-500">
            {activeLocation?.type} - {activeLocation?.distance}
          </p>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-700 hover:bg-slate-200"
          aria-label="Close location card"
        >
          <FiX size={18} />
        </button>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className={`rounded-full border px-2.5 py-1 text-xs font-bold ${status.className}`}>
          {status.label}
        </span>
      </div>

      <p className="mt-3 text-sm leading-6 text-slate-600">{activeLocation?.description}</p>

      <div className="mt-4 grid gap-2">
        <button className="h-11 rounded-2xl bg-green-600 text-sm font-bold text-white">
          Set as Pickup
        </button>

        <button
          type="button"
          onClick={onAddLocation}
          className="h-11 rounded-2xl border border-slate-200 text-sm font-bold text-slate-700"
        >
          Add Missing Location
        </button>
      </div>

      <section className="mt-5">
        <div className="mb-2 flex items-center gap-2 text-sm font-black">
          <FiShield className="text-red-500" />
          Emergency Contacts
        </div>

        <div className="grid gap-2">
          {emergencyContacts.map((contact) => (
            <div key={contact.id} className="flex items-center justify-between rounded-2xl bg-slate-50 px-3 py-2">
              <span className="text-sm font-semibold text-slate-700">{contact.label}</span>
              <span className="flex items-center gap-1 text-xs font-bold text-slate-500">
                <FiPhone size={13} />
                {contact.value}
              </span>
            </div>
          ))}
        </div>
      </section>
    </aside>
  );
}

function AddLocationPanel({
  busy,
  cautionOpen,
  draft,
  onBack,
  onChange,
  onCloseCaution,
  onConfirmLocateMe,
  onDropPin,
  onLocateMe,
  onSubmit,
  status,
}) {
  const category = draft.category || addCategories[0];
  const selectedLocationLabel = draft.coordinatesLabel || formatCoordinatesLabel(draft);
  const hasSelectedLocation = Number.isFinite(Number(draft.lat)) && Number.isFinite(Number(draft.lng));
  const panelCollapse = useAutoCollapseCard({
    enabled: false,
    resetKey: [
      status,
      hasSelectedLocation ? selectedLocationLabel : "no-point",
      draft.source,
      draft.lat,
      draft.lng,
    ].join("|"),
  });
  const cautionCollapse = useAutoCollapseCard({
    enabled: false,
    resetKey: ["locate-caution", status, busy ? "busy" : "ready"].join("|"),
  });

  if (panelCollapse.collapsed && !cautionOpen) {
    return (
      <div className="pointer-events-none absolute inset-0 z-40">
        <div className="pointer-events-auto absolute bottom-5 right-4 sm:right-5">
          <MapCardCollapseButton
            collapsed
            label="Maximize add location form"
            onClick={panelCollapse.expand}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="absolute inset-0 z-40 flex items-end bg-slate-950/45 sm:items-center sm:justify-center">
      <section
        className="relative flex max-h-[calc(100vh-1.5rem)] w-full flex-col rounded-t-3xl bg-white text-slate-950 shadow-2xl sm:max-w-xl sm:rounded-3xl"
      >
        <div className="sticky top-0 z-10 border-b border-slate-100 bg-white/95 p-4 backdrop-blur sm:rounded-t-3xl">
        <div className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <AppBackTab
              onBack={onBack}
              label="Back to Area View"
              historyKey="area-view-add-location"
              useHistoryLayer={false}
              className="h-11 w-11 bg-slate-100 text-slate-900"
              iconSize={21}
            />
            <div className="min-w-0">
              <h2 className="truncate text-xl font-black">Add Location</h2>
              <p className="mt-1 text-sm font-semibold text-slate-500">Add local places that are missing from normal maps.</p>
            </div>
          </div>
          <MapCardCollapseButton
            label="Minimize add location form"
            onClick={panelCollapse.collapse}
          />
        </div>
        </div>

        <div className="overflow-y-auto p-4">
        {status ? (
          <div className={`mb-4 rounded-2xl border px-4 py-3 text-sm font-bold leading-6 ${
            hasSelectedLocation ? "border-green-100 bg-green-50 text-green-800" : "border-amber-100 bg-amber-50 text-amber-800"
          }`}>
            {status}
          </div>
        ) : null}

        {hasSelectedLocation ? (
          <div className="mb-4 rounded-2xl border border-green-100 bg-white px-4 py-3 shadow-sm">
            <p className="text-xs font-black uppercase tracking-wide text-green-700">Selected map point</p>
            <p className="mt-1 text-sm font-black text-slate-950">{draft.address || "Pinned location"}</p>
            {selectedLocationLabel ? <p className="mt-1 text-xs font-bold text-green-700">{selectedLocationLabel}</p> : null}
          </div>
        ) : null}

        <div className="grid gap-3 sm:grid-cols-2">
          <FormInput
            label="Place name"
            value={draft.name}
            onChange={(value) => onChange("name", value)}
            placeholder="Example: Musa Mini Mart"
          />

          <label className="block">
            <span className="mb-2 block text-sm font-bold text-slate-700">Category</span>
            <select
              value={category}
              onChange={(event) => onChange("category", event.target.value)}
              className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 text-sm font-semibold outline-none"
            >
              {addCategories.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </label>

          {category === "Other" ? (
            <FormInput
              label="Category name"
              value={draft.categoryName}
              onChange={(value) => onChange("categoryName", value)}
              placeholder="Example: Garage, mosque, office, junction..."
            />
          ) : null}

          <FormInput
            label="Street / address"
            value={draft.address}
            onChange={(value) => onChange("address", value)}
            placeholder="Street, junction, or area"
          />
          <FormInput
            label="Landmark"
            value={draft.landmark}
            onChange={(value) => onChange("landmark", value)}
            placeholder="Near school, mosque, market..."
          />
          <FormInput
            label="Phone optional"
            value={draft.phone}
            onChange={(value) => onChange("phone", value)}
            placeholder={getCountryPhonePlaceholder()}
          />
          <FormInput
            label="Opening hours optional"
            value={draft.openingHours}
            onChange={(value) => onChange("openingHours", value)}
            placeholder="8 AM - 9 PM"
          />
        </div>

        <label className="mt-3 block">
          <span className="mb-2 block text-sm font-bold text-slate-700">Why is this place useful?</span>
          <textarea
            rows="3"
            value={draft.description}
            onChange={(event) => onChange("description", event.target.value)}
            className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm font-semibold outline-none"
            placeholder="Pickup point, safe waiting spot, shop landmark, emergency help..."
          />
        </label>

        <div className="sticky bottom-0 -mx-4 mt-4 grid gap-2 border-t border-slate-100 bg-white/95 p-4 backdrop-blur sm:grid-cols-3">
          <button
            type="button"
            onClick={onLocateMe}
            disabled={busy}
            className="h-11 rounded-2xl border border-green-200 bg-green-50 px-4 text-sm font-black text-green-700 disabled:opacity-60"
          >
            Locate Me
          </button>

          <button
            type="button"
            onClick={onDropPin}
            disabled={busy}
            className="h-11 rounded-2xl border border-slate-200 px-4 text-sm font-black text-slate-700 disabled:opacity-60"
          >
            Drop Pin
          </button>

          <button
            type="button"
            onClick={onSubmit}
            disabled={busy}
            className="h-11 rounded-2xl bg-green-600 px-4 text-sm font-black text-white disabled:opacity-60"
          >
            {busy ? "Please wait..." : "Submit for Review"}
          </button>
        </div>
        </div>

        {cautionOpen && cautionCollapse.collapsed ? (
          <div className="pointer-events-auto absolute bottom-5 right-4 z-30 sm:right-5">
            <MapCardCollapseButton
              collapsed
              label="Maximize locate me confirmation"
              onClick={cautionCollapse.expand}
            />
          </div>
        ) : null}

        {cautionOpen && !cautionCollapse.collapsed ? (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-slate-950/45 px-4 backdrop-blur-sm">
            <div className="relative w-full max-w-md rounded-3xl bg-white p-5 text-slate-950 shadow-2xl">
              <button
                type="button"
                onClick={onCloseCaution}
                className="absolute left-3 top-3 flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-slate-700 hover:bg-slate-200"
                aria-label="Cancel locate me"
              >
                <FiX size={18} />
              </button>
              <MapCardCollapseButton
                className="absolute right-3 top-3"
                label="Minimize locate me confirmation"
                onClick={cautionCollapse.collapse}
              />
              <div className="pl-11">
                <p className="text-xs font-black uppercase tracking-wide text-green-700">Confirm location</p>
                <h3 className="mt-1 text-xl font-black">Be at the exact location</h3>
              </div>
              <p className="mt-4 text-sm font-semibold leading-6 text-slate-600">
                Please make sure you are standing at the exact place you want to add. KunThai will use your device location to help reviewers place this location correctly.
              </p>
              <div className="mt-5 grid gap-2 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={onConfirmLocateMe}
                  disabled={busy}
                  className="h-11 rounded-2xl bg-green-600 text-sm font-black text-white disabled:opacity-60"
                >
                  Yes, locate me
                </button>
                <button
                  type="button"
                  onClick={onDropPin}
                  disabled={busy}
                  className="h-11 rounded-2xl border border-slate-200 text-sm font-black text-slate-700 disabled:opacity-60"
                >
                  Drop a pin
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
}
function FormInput({ label, onChange, placeholder, value }) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-bold text-slate-700">{label}</span>
      <input
        placeholder={placeholder}
        value={value || ""}
        onChange={(event) => onChange?.(event.target.value)}
        className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 text-sm font-semibold outline-none placeholder:text-slate-400"
      />
    </label>
  );
}
