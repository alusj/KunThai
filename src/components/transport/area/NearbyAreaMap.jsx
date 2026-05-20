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
  wrapper.style.width = "72px";
  wrapper.style.height = "64px";
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
  pin.style.top = "26px";
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

function getNearestRouteDistance(position, coordinates = []) {
  if (!position || !coordinates.length) return Infinity;

  return coordinates.reduce((nearest, coord) => {
    const distance = distanceInMeters(position, {
      lng: coord[0],
      lat: coord[1],
    });

    return Math.min(nearest, distance);
  }, Infinity);
}

function getRouteStatus(distanceFromRoute) {
  if (distanceFromRoute <= 45) return "correct";
  if (distanceFromRoute <= 120) return "warning";
  return "wrong";
}

function setRouteLineColor(map, color) {
  if (!map?.getLayer("route-line")) return;

  map.setPaintProperty("route-line", "line-color", color);
}

export default function NearbyAreaMap({
  children,
  onLocationResolved,
  onMapReady,
  selectedLocation,
  focusMode = false,
}) {
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const userMarkerRef = useRef(null);
  const destinationMarkerRef = useRef(null);
  const watchIdRef = useRef(null);
  const routeCoordinatesRef = useRef([]);

  const [locationStatus, setLocationStatus] = useState(
    `Showing ${DEFAULT_CENTER.label}`
  );
  const [userLocation, setUserLocation] = useState(null);
  const [routeInfo, setRouteInfo] = useState(null);
  const [routeError, setRouteError] = useState("");
  const [routeStatusKey, setRouteStatusKey] = useState("correct");

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
      element: createLabeledMarker("START", "#16a34a"),
      anchor: "center",
    })
      .setLngLat([DEFAULT_CENTER.lng, DEFAULT_CENTER.lat])
      .addTo(map);

    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }

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

        setLocationStatus("Using your current area");
        setUserLocation(nextCenter);
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

      const routeStart = userLocation || DEFAULT_CENTER;
      const map = mapRef.current;

      setRouteError("");
      setRouteInfo(null);
      setRouteStatusKey("correct");

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
        const livePosition = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          label: "Live current location",
        };

        setUserLocation(livePosition);
        onLocationResolved?.(livePosition);
        userMarkerRef.current?.setLngLat([livePosition.lng, livePosition.lat]);

        if (focusMode) {
          mapRef.current?.easeTo({
            center: [livePosition.lng, livePosition.lat],
            duration: 700,
          });
        }

        if (routeCoordinatesRef.current.length) {
          const nearestDistance = getNearestRouteDistance(
            livePosition,
            routeCoordinatesRef.current
          );

          const nextStatusKey = getRouteStatus(nearestDistance);
          setRouteStatusKey(nextStatusKey);
          setRouteLineColor(mapRef.current, ROUTE_STATUS[nextStatusKey].color);
        }
      },
      () => {},
      {
        enableHighAccuracy: true,
        maximumAge: 4000,
        timeout: 12000,
      }
    );

    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
    };
  }, [focusMode, onLocationResolved]);

  return (
    <div className="absolute inset-0 bg-slate-900">
      <div ref={mapContainerRef} className="absolute inset-0 h-full w-full" />

      <div className="pointer-events-none absolute inset-0 bg-slate-950/10" />

      {!focusMode && (
        <div className="pointer-events-none absolute left-3 top-24 z-10 rounded-full bg-white/90 px-3 py-1 text-xs font-black text-slate-700 shadow sm:left-5 sm:top-28">
          {locationStatus}
        </div>
      )}

      {routeInfo && (
        <div className="absolute bottom-24 left-4 z-30 w-[calc(100%-2rem)] max-w-md rounded-3xl bg-white/95 p-4 text-slate-950 shadow-2xl backdrop-blur sm:bottom-6">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs font-black uppercase tracking-wide text-green-600">
              Recommended Route
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

            <div className="rounded-2xl bg-green-100 px-3 py-2 text-xs font-black text-green-700">
              START
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