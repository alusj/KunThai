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
  animationMs: 1150,
  ignoreAccuracyAboveMeters: 140,
  correctRouteMeters: 45,
  warningRouteMeters: 120,
  progressBacktrackSegments: 4,
  ignoreTinyMoveMeters: 2.5,
  jumpDistanceMeters: 90,
  maxHumanSpeedMetersPerSecond: 22,
};

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
  label.textContent = "START";
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

function createOperatorMarker(operator) {
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
  const routeStatusRef = useRef("correct");
  const routeInfoRef = useRef(null);
  const userLocationRef = useRef(null);
  const lastRawPositionRef = useRef(null);
  const lastRawTimestampRef = useRef(null);

  const [locationStatus, setLocationStatus] = useState(`Showing ${DEFAULT_CENTER.label}`);
  const [userLocation, setUserLocation] = useState(null);
  const [routeInfo, setRouteInfo] = useState(null);
  const [routeError, setRouteError] = useState("");
  const [routeLoading, setRouteLoading] = useState(false);
  const [routeStatusKey, setRouteStatusKey] = useState("correct");
  const [gpsAccuracy, setGpsAccuracy] = useState(null);
  const [navigationMinimized, setNavigationMinimized] = useState(false);

  const routeStatus = ROUTE_STATUS[routeStatusKey];
  const showNavigationCard = Boolean(routeLoading || routeInfo || routeError);
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

  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: osmRasterStyle,
      center: [DEFAULT_CENTER.lng, DEFAULT_CENTER.lat],
      zoom: 13,
      pitch: 0,
      bearing: 0,
      attributionControl: true,
    });

    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "bottom-right");

    mapRef.current = map;
    onMapReady?.(map);

    userMarkerRef.current = new maplibregl.Marker({
      element: createLiveUserMarker(),
      anchor: "center",
    })
      .setLngLat([DEFAULT_CENTER.lng, DEFAULT_CENTER.lat])
      .addTo(map);
    markerRenderedPositionRef.current = DEFAULT_CENTER;

    return () => {
      markerAnimationCancelRef.current?.();

      if (watchIdRef.current !== null) navigator.geolocation.clearWatch(watchIdRef.current);

      operatorMarkersRef.current.forEach((marker) => marker.remove());
      operatorMarkersRef.current.clear();

      userMarkerRef.current?.remove();
      destinationMarkerRef.current?.remove();

      clearRouteLayers(map);

      map.remove();
      mapRef.current = null;
      userMarkerRef.current = null;
      destinationMarkerRef.current = null;
      watchIdRef.current = null;
      markerRenderedPositionRef.current = null;
    };
  }, [onMapReady]);

  useEffect(() => {
    if (!navigator.geolocation) {
      setLocationStatus(`Showing ${DEFAULT_CENTER.label}`);
      setUserLocation(DEFAULT_CENTER);
      userLocationRef.current = DEFAULT_CENTER;
      smoothedPositionRef.current = DEFAULT_CENTER;
      markerRenderedPositionRef.current = DEFAULT_CENTER;
      lastRawPositionRef.current = DEFAULT_CENTER;
      lastRawTimestampRef.current = Date.now();
      return;
    }

    setLocationStatus("Checking location...");

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const nextCenter = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          label: "Your current area",
        };

        setGpsAccuracy(Math.round(position.coords.accuracy || 0));
        setLocationStatus("Using your current area");
        setUserLocation(nextCenter);
        userLocationRef.current = nextCenter;
        smoothedPositionRef.current = nextCenter;
        markerRenderedPositionRef.current = nextCenter;
        lastRawPositionRef.current = nextCenter;
        lastRawTimestampRef.current = Date.now();
        onLocationResolved?.(nextCenter);

        mapRef.current?.flyTo({
          center: [nextCenter.lng, nextCenter.lat],
          zoom: 15,
          essential: true,
        });

        userMarkerRef.current?.setLngLat([nextCenter.lng, nextCenter.lat]);
      },
      () => {
        setLocationStatus(`Showing ${DEFAULT_CENTER.label}`);
        setUserLocation(DEFAULT_CENTER);
        userLocationRef.current = DEFAULT_CENTER;
        smoothedPositionRef.current = DEFAULT_CENTER;
        markerRenderedPositionRef.current = DEFAULT_CENTER;
        lastRawPositionRef.current = DEFAULT_CENTER;
        lastRawTimestampRef.current = Date.now();
        onLocationResolved?.(DEFAULT_CENTER);
      },
      {
        enableHighAccuracy: true,
        timeout: 8000,
        maximumAge: 60000,
      },
    );
  }, [onLocationResolved]);

  useEffect(() => {
    const current = markerRenderedPositionRef.current || smoothedPositionRef.current || userLocation || DEFAULT_CENTER;

    mapRef.current?.easeTo({
      center: [current.lng, current.lat],
      zoom: Math.max(mapRef.current.getZoom(), 15),
      duration: 600,
      essential: true,
    });
  }, [recenterSignal]);

  useEffect(() => {
    routeInfoRef.current = routeInfo;
  }, [routeInfo]);

  useEffect(() => {
    let cancelled = false;

    async function drawRoute() {
      if (!selectedLocation || !mapRef.current) return;

      const routeStart = smoothedPositionRef.current || userLocationRef.current || DEFAULT_CENTER;
      const map = mapRef.current;

      setRouteError("");
      setRouteLoading(true);
      setRouteInfo({
        from: userLocationRef.current ? "Current Location" : DEFAULT_CENTER.label,
        to: selectedLocation.name || "Selected destination",
        distance: "Finding route",
        duration: "...",
      });
      setRouteStatusKey("correct");
      routeStatusRef.current = "correct";
      setNavigationMinimized(false);
      lastRouteSegmentIndexRef.current = 0;

      destinationMarkerRef.current?.remove();

      destinationMarkerRef.current = new maplibregl.Marker({
        element: createLabeledMarker("END", "#2563eb"),
        anchor: "center",
      })
        .setLngLat([selectedLocation.lng, selectedLocation.lat])
        .addTo(map);

      await waitForMapStyle(map);

      const route = await getRouteBetweenPoints(routeStart, selectedLocation);

      if (cancelled) return;

      routeCoordinatesRef.current = route.geometry.coordinates || [];

      clearRouteLayers(map);

      map.addSource("route", {
        type: "geojson",
        data: {
          type: "Feature",
          geometry: route.geometry,
        },
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
          "line-color": ROUTE_STATUS.correct.color,
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
          "line-color": ROUTE_STATUS.correct.color,
          "line-width": 7,
          "line-opacity": 0.95,
        },
      });

      const bounds = new maplibregl.LngLatBounds();
      route.geometry.coordinates.forEach((coord) => bounds.extend(coord));

      map.fitBounds(bounds, {
        padding: { top: 140, bottom: 230, left: 70, right: 70 },
        duration: 1000,
      });

      setRouteInfo({
        from: userLocationRef.current ? "Current Location" : DEFAULT_CENTER.label,
        to: selectedLocation.name,
        distance: formatDistance(route.distanceMeters),
        duration: formatDuration(route.durationSeconds),
      });
      setRouteLoading(false);
    }

    drawRoute().catch((error) => {
      console.error(error);
      if (cancelled) return;
      routeCoordinatesRef.current = [];
      clearRouteLayers(mapRef.current);
      setRouteLoading(false);
      setRouteStatusKey("wrong");
      routeStatusRef.current = "wrong";
      setRouteInfo({
        from: userLocationRef.current ? "Current Location" : DEFAULT_CENTER.label,
        to: selectedLocation?.name || "Selected destination",
        distance: "Route unavailable",
        duration: "Try again",
      });
      setNavigationMinimized(false);
      setRouteError("Route unavailable. Check the route key or try another location.");
    });

    return () => {
      cancelled = true;
    };
  }, [selectedLocation]);

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
          setLocationStatus(`Weak GPS signal - ${accuracy}m accuracy`);
          setGpsAccuracy(accuracy);
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
            setLocationStatus(`Filtering GPS jump - ${accuracy}m accuracy`);
            setGpsAccuracy(accuracy);
            return;
          }
        }

        lastRawPositionRef.current = rawLivePosition;
        lastRawTimestampRef.current = now;

        const previousSmoothedPosition = smoothedPositionRef.current || userLocationRef.current || DEFAULT_CENTER;
        const livePosition = getSmoothedPosition(previousSmoothedPosition, rawLivePosition, elapsedMs);
        const movedMeters = distanceInMeters(previousSmoothedPosition, livePosition);

        if (movedMeters <= GPS_SETTINGS.ignoreTinyMoveMeters) {
          setGpsAccuracy(accuracy);
          return;
        }

        setGpsAccuracy(accuracy);
        setLocationStatus("Live tracking active");
        setUserLocation(livePosition);
        userLocationRef.current = livePosition;
        onLocationResolved?.(livePosition);

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
          setNavigationMinimized(true);
        }

        if (focusMode) {
          mapRef.current?.easeTo({
            center: [livePosition.lng, livePosition.lat],
            zoom: Math.max(mapRef.current.getZoom(), 15),
            duration: 700,
          });
        }

        if (routeCoordinatesRef.current.length) {
          const nearestRouteInfo = getNearestRouteInfo(livePosition, routeCoordinatesRef.current);

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
              setNavigationMinimized(false);
            }
          }

          setRouteLineColor(mapRef.current, ROUTE_STATUS[nextStatusKey].color);
        }
      },
      () => {
        setLocationStatus("Location permission needed for live tracking");
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
  }, [focusMode, onLocationResolved]);

  useEffect(() => {
    if (!mapRef.current) return;

    const map = mapRef.current;
    const nextIds = new Set(operatorLocations.map((operator) => operator.id));

    operatorMarkersRef.current.forEach((marker, id) => {
      if (!nextIds.has(id)) {
        marker.remove();
        operatorMarkersRef.current.delete(id);
      }
    });

    operatorLocations.forEach((operator) => {
      if (!operator?.id || operator.lat == null || operator.lng == null) return;

      const existingMarker = operatorMarkersRef.current.get(operator.id);

      if (existingMarker) {
        existingMarker.setLngLat([operator.lng, operator.lat]);
        return;
      }

      const marker = new maplibregl.Marker({
        element: createOperatorMarker(operator),
        anchor: "center",
      })
        .setLngLat([operator.lng, operator.lat])
        .addTo(map);

      operatorMarkersRef.current.set(operator.id, marker);
    });
  }, [operatorLocations]);

  return (
    <div className="absolute inset-0 bg-slate-900">
      <div ref={mapContainerRef} className="absolute inset-0 h-full w-full" />
      <div className="pointer-events-none absolute inset-0 bg-slate-950/10" />

      {!focusMode && (
        <div className="pointer-events-none absolute left-3 top-28 z-10 rounded-full bg-white/90 px-3 py-1 text-xs font-black text-slate-700 shadow sm:left-5 sm:top-28">
          {locationStatus}
          {gpsAccuracy ? <span className="ml-2 text-slate-400">GPS {gpsAccuracy}m</span> : null}
        </div>
      )}

      {showNavigationCard && (
        <div
          className={`absolute left-3 right-3 z-30 rounded-3xl bg-white/95 text-slate-950 shadow-2xl backdrop-blur transition-all sm:left-5 sm:right-auto sm:max-w-md ${
            navigationMinimized ? "bottom-24 p-3 sm:bottom-6" : "bottom-24 p-4 sm:bottom-6"
          }`}
        >
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs font-black uppercase tracking-wide text-green-600">
              Live Navigation
            </p>

            <div className="flex items-center gap-2">
              <span className={`rounded-full px-2.5 py-1 text-[11px] font-black ${routeCardStatus.className}`}>
                {routeCardStatus.label}
              </span>

              <button
                type="button"
                onClick={() => setNavigationMinimized((value) => !value)}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-slate-700"
                aria-label={navigationMinimized ? "Expand navigation" : "Minimize navigation"}
              >
                {navigationMinimized ? "＋" : "－"}
              </button>
            </div>
          </div>

          {navigationMinimized ? (
            <div className="mt-2 flex items-center justify-between gap-3">
              <h3 className="text-lg font-black">
                {routeInfo.distance} • {routeInfo.duration}
              </h3>
              <span className={`rounded-2xl px-3 py-2 text-xs font-black ${routeCardStatus.className}`}>
                {routeError ? "CHECK" : routeLoading ? "WAIT" : routeStatusKey.toUpperCase()}
              </span>
            </div>
          ) : (
            <>
              <div className="mt-2 flex items-center justify-between gap-4">
                <div>
                  <h3 className="text-xl font-black sm:text-lg">
                    {routeInfo.distance} • {routeInfo.duration}
                  </h3>
                  <p className="mt-1 line-clamp-2 text-sm font-semibold text-slate-500">
                    To: {routeInfo.to}
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

              <div className="mt-3 grid gap-2 text-xs font-bold text-slate-600">
                <div className="flex items-center gap-2">
                  <span className="h-3 w-3 shrink-0 rounded-full bg-green-600" />
                  <span>
                    <strong className="text-slate-900">Start:</strong> {routeInfo.from}
                  </span>
                </div>

                <div className="flex items-start gap-2">
                  <span className="mt-1 h-3 w-3 shrink-0 rounded-full bg-blue-600" />
                  <span className="line-clamp-2">
                    <strong className="text-slate-900">End:</strong> {routeInfo.to}
                  </span>
                </div>
              </div>
            </>
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
