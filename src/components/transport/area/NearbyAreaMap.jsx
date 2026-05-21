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
    color: "#16a34a",
    className: "bg-green-100 text-green-700",
  },
  warning: {
    label: "Slightly off route",
    color: "#eab308",
    className: "bg-yellow-100 text-yellow-700",
  },
  wrong: {
    label: "Wrong route detected",
    color: "#dc2626",
    className: "bg-red-100 text-red-700",
  },
};

const GPS_SETTINGS = {
  animationMs: 900,
  ignoreAccuracyAboveMeters: 180,
  correctRouteMeters: 45,
  warningRouteMeters: 120,
  progressBacktrackSegments: 3,
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
  badge.style.letterSpacing = "0.5px";
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
  pulse.style.width = "64px";
  pulse.style.height = "64px";
  pulse.style.borderRadius = "999px";
  pulse.style.background = "rgba(22, 163, 74, 0.20)";
  pulse.style.border = "2px solid rgba(22, 163, 74, 0.28)";

  const dot = document.createElement("div");
  dot.style.width = "26px";
  dot.style.height = "26px";
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
  wrapper.style.fontWeight = "900";
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
  return {
    lng: coord[0],
    lat: coord[1],
  };
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

  if (!segmentLengthSquared) {
    return distanceInMeters(position, start);
  }

  const projection =
    ((p.x - a.x) * segmentX + (p.y - a.y) * segmentY) / segmentLengthSquared;

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
    return {
      distance: Infinity,
      segmentIndex: 0,
    };
  }

  let nearestDistance = Infinity;
  let nearestSegmentIndex = 0;

  for (let index = 0; index < coordinates.length - 1; index += 1) {
    const distance = distanceToRouteSegment(
      position,
      coordinates[index],
      coordinates[index + 1]
    );

    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearestSegmentIndex = index;
    }
  }

  return {
    distance: nearestDistance,
    segmentIndex: nearestSegmentIndex,
  };
}

function getRouteStatus(distanceFromRoute, isMovingBackward) {
  if (isMovingBackward) return "wrong";
  if (distanceFromRoute <= GPS_SETTINGS.correctRouteMeters) return "correct";
  if (distanceFromRoute <= GPS_SETTINGS.warningRouteMeters) return "warning";
  return "wrong";
}

function setRouteLineColor(map, color) {
  if (!map?.getLayer("route-line")) return;

  map.setPaintProperty("route-line", "line-color", color);
}

function getSmoothedPosition(previousPosition, nextPosition) {
  if (!previousPosition) return nextPosition;

  const distance = distanceInMeters(previousPosition, nextPosition);

  if (distance <= 2) return previousPosition;

  const smoothingPower = distance > 80 ? 0.8 : distance > 35 ? 0.55 : 0.35;

  return {
    ...nextPosition,
    lat: lerp(previousPosition.lat, nextPosition.lat, smoothingPower),
    lng: lerp(previousPosition.lng, nextPosition.lng, smoothingPower),
  };
}

function animateMarkerTo(marker, fromPosition, toPosition, duration = GPS_SETTINGS.animationMs) {
  if (!marker || !fromPosition || !toPosition) return null;

  const startedAt = performance.now();
  let frameId = null;

  function step(now) {
    const progress = Math.min((now - startedAt) / duration, 1);
    const easedProgress = easeOutCubic(progress);

    const nextLng = lerp(fromPosition.lng, toPosition.lng, easedProgress);
    const nextLat = lerp(fromPosition.lat, toPosition.lat, easedProgress);

    marker.setLngLat([nextLng, nextLat]);

    if (progress < 1) {
      frameId = requestAnimationFrame(step);
    }
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
}) {
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const userMarkerRef = useRef(null);
  const destinationMarkerRef = useRef(null);
  const watchIdRef = useRef(null);
  const routeCoordinatesRef = useRef([]);
  const smoothedPositionRef = useRef(null);
  const markerAnimationCancelRef = useRef(null);
  const lastRouteSegmentIndexRef = useRef(0);
  const operatorMarkersRef = useRef(new Map());

  const [locationStatus, setLocationStatus] = useState(
    `Showing ${DEFAULT_CENTER.label}`
  );
  const [userLocation, setUserLocation] = useState(null);
  const [routeInfo, setRouteInfo] = useState(null);
  const [routeError, setRouteError] = useState("");
  const [routeStatusKey, setRouteStatusKey] = useState("correct");
  const [gpsAccuracy, setGpsAccuracy] = useState(null);

  const routeStatus = ROUTE_STATUS[routeStatusKey];

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

    map.addControl(
      new maplibregl.NavigationControl({ visualizePitch: true }),
      "bottom-right"
    );

    map.addControl(
      new maplibregl.GeolocateControl({
        positionOptions: { enableHighAccuracy: true },
        trackUserLocation: true,
        showUserHeading: true,
      }),
      "bottom-right"
    );

    mapRef.current = map;
    onMapReady?.(map);

    userMarkerRef.current = new maplibregl.Marker({
      element: createLiveUserMarker(),
      anchor: "center",
    })
      .setLngLat([DEFAULT_CENTER.lng, DEFAULT_CENTER.lat])
      .addTo(map);

    return () => {
      markerAnimationCancelRef.current?.();

      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }

      operatorMarkersRef.current.forEach((marker) => marker.remove());
      operatorMarkersRef.current.clear();

      userMarkerRef.current?.remove();
      destinationMarkerRef.current?.remove();

      if (map.getSource("route")) {
        if (map.getLayer("route-line")) map.removeLayer("route-line");
        map.removeSource("route");
      }

      map.remove();
      mapRef.current = null;
      userMarkerRef.current = null;
      destinationMarkerRef.current = null;
      watchIdRef.current = null;
    };
  }, [onMapReady]);

  useEffect(() => {
    if (!navigator.geolocation) {
      setLocationStatus(`Showing ${DEFAULT_CENTER.label}`);
      setUserLocation(DEFAULT_CENTER);
      smoothedPositionRef.current = DEFAULT_CENTER;
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
        smoothedPositionRef.current = nextCenter;
        onLocationResolved?.(nextCenter);

        mapRef.current?.flyTo({
          center: [nextCenter.lng, nextCenter.lat],
          zoom: 14,
          essential: true,
        });

        userMarkerRef.current?.setLngLat([nextCenter.lng, nextCenter.lat]);
      },
      () => {
        setLocationStatus(`Showing ${DEFAULT_CENTER.label}`);
        setUserLocation(DEFAULT_CENTER);
        smoothedPositionRef.current = DEFAULT_CENTER;
        onLocationResolved?.(DEFAULT_CENTER);
      },
      {
        enableHighAccuracy: true,
        timeout: 8000,
        maximumAge: 60000,
      }
    );
  }, [onLocationResolved]);

  useEffect(() => {
    async function drawRoute() {
      if (!selectedLocation || !mapRef.current) return;

      const routeStart = smoothedPositionRef.current || userLocation || DEFAULT_CENTER;
      const map = mapRef.current;

      setRouteError("");
      setRouteInfo(null);
      setRouteStatusKey("correct");
      lastRouteSegmentIndexRef.current = 0;

      destinationMarkerRef.current?.remove();

      destinationMarkerRef.current = new maplibregl.Marker({
        element: createLabeledMarker("END", "#2563eb"),
        anchor: "center",
      })
        .setLngLat([selectedLocation.lng, selectedLocation.lat])
        .addTo(map);

      const route = await getRouteBetweenPoints(routeStart, selectedLocation);

      routeCoordinatesRef.current = route.geometry.coordinates || [];

      if (map.getSource("route")) {
        if (map.getLayer("route-line")) map.removeLayer("route-line");
        map.removeSource("route");
      }

      map.addSource("route", {
        type: "geojson",
        data: {
          type: "Feature",
          geometry: route.geometry,
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

      route.geometry.coordinates.forEach((coord) => {
        bounds.extend(coord);
      });

      map.fitBounds(bounds, {
        padding: {
          top: 160,
          bottom: 160,
          left: 90,
          right: 90,
        },
        duration: 1200,
      });

      setRouteInfo({
        from: userLocation ? "Current Location" : DEFAULT_CENTER.label,
        to: selectedLocation.name,
        distance: formatDistance(route.distanceMeters),
        duration: formatDuration(route.durationSeconds),
      });
    }

    drawRoute().catch((error) => {
      console.error(error);
      setRouteError("Route unavailable. Try another location.");
    });
  }, [selectedLocation, userLocation]);

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

        const previousSmoothedPosition =
          smoothedPositionRef.current || userLocation || DEFAULT_CENTER;

        const livePosition = getSmoothedPosition(
          previousSmoothedPosition,
          rawLivePosition
        );

        setGpsAccuracy(accuracy);
        setLocationStatus("Live tracking active");
        setUserLocation(livePosition);
        onLocationResolved?.(livePosition);

        markerAnimationCancelRef.current?.();
        markerAnimationCancelRef.current = animateMarkerTo(
          userMarkerRef.current,
          previousSmoothedPosition,
          livePosition
        );

        smoothedPositionRef.current = livePosition;

        if (focusMode) {
          mapRef.current?.easeTo({
            center: [livePosition.lng, livePosition.lat],
            zoom: Math.max(mapRef.current.getZoom(), 15),
            duration: 700,
          });
        }

        if (routeCoordinatesRef.current.length) {
          const nearestRouteInfo = getNearestRouteInfo(
            livePosition,
            routeCoordinatesRef.current
          );

          const isMovingBackward =
            nearestRouteInfo.segmentIndex + GPS_SETTINGS.progressBacktrackSegments <
            lastRouteSegmentIndexRef.current;

          if (!isMovingBackward) {
            lastRouteSegmentIndexRef.current = Math.max(
              lastRouteSegmentIndexRef.current,
              nearestRouteInfo.segmentIndex
            );
          }

          const nextStatusKey = getRouteStatus(
            nearestRouteInfo.distance,
            isMovingBackward
          );

          setRouteStatusKey(nextStatusKey);
          setRouteLineColor(mapRef.current, ROUTE_STATUS[nextStatusKey].color);
        }
      },
      () => {
        setLocationStatus("Location permission needed for live tracking");
      },
      {
        enableHighAccuracy: true,
        maximumAge: 2500,
        timeout: 12000,
      }
    );

    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
    };
  }, [focusMode, onLocationResolved, userLocation]);

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
        <div className="pointer-events-none absolute left-3 top-24 z-10 rounded-full bg-white/90 px-3 py-1 text-xs font-black text-slate-700 shadow sm:left-5 sm:top-28">
          {locationStatus}
          {gpsAccuracy ? (
            <span className="ml-2 text-slate-400">GPS {gpsAccuracy}m</span>
          ) : null}
        </div>
      )}

      {routeInfo && (
        <div className="absolute bottom-24 left-4 z-30 w-[calc(100%-2rem)] max-w-md rounded-3xl bg-white/95 p-4 text-slate-950 shadow-2xl backdrop-blur sm:bottom-6">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs font-black uppercase tracking-wide text-green-600">
              Live Navigation
            </p>

            <span
              className={`rounded-full px-2.5 py-1 text-[11px] font-black ${routeStatus.className}`}
            >
              {routeStatus.label}
            </span>
          </div>

          <div className="mt-2 flex items-center justify-between gap-4">
            <div>
              <h3 className="text-lg font-black">
                {routeInfo.distance} • {routeInfo.duration}
              </h3>
              <p className="mt-1 line-clamp-2 text-sm font-semibold text-slate-500">
                To: {routeInfo.to}
              </p>
            </div>

            <div
              className={`rounded-2xl px-3 py-2 text-xs font-black ${routeStatus.className}`}
            >
              {routeStatusKey.toUpperCase()}
            </div>
          </div>

          <div className="mt-3 grid gap-2 text-xs font-bold text-slate-600">
            <div className="flex items-center gap-2">
              <span className="h-3 w-3 shrink-0 rounded-full bg-green-600" />
              <span>
                <strong className="text-slate-900">Start:</strong>{" "}
                {routeInfo.from}
              </span>
            </div>

            <div className="flex items-start gap-2">
              <span className="mt-1 h-3 w-3 shrink-0 rounded-full bg-blue-600" />
              <span className="line-clamp-2">
                <strong className="text-slate-900">End:</strong>{" "}
                {routeInfo.to}
              </span>
            </div>
          </div>

          <div className="mt-3 rounded-2xl bg-slate-100 px-3 py-2 text-[11px] font-bold text-slate-500">
            Green = correct route • Yellow = slight deviation • Red = wrong route
          </div>
        </div>
      )}

      {routeError && (
        <div className="absolute bottom-6 left-4 z-30 rounded-2xl bg-red-600 px-4 py-3 text-sm font-bold text-white shadow-xl">
          {routeError}
        </div>
      )}

      {children}
    </div>
  );
}