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

export default function NearbyAreaMap({
  children,
  onLocationResolved,
  onMapReady,
  selectedLocation,
}) {
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const userMarkerRef = useRef(null);
  const destinationMarkerRef = useRef(null);

  const [locationStatus, setLocationStatus] = useState(
    `Showing ${DEFAULT_CENTER.label}`
  );
  const [userLocation, setUserLocation] = useState(null);
  const [routeInfo, setRouteInfo] = useState(null);
  const [routeError, setRouteError] = useState("");

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

    userMarkerRef.current = new maplibregl.Marker({ color: "#16a34a" })
      .setLngLat([DEFAULT_CENTER.lng, DEFAULT_CENTER.lat])
      .setPopup(new maplibregl.Popup({ offset: 25 }).setText("Starting point"))
      .addTo(map);

    return () => {
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
    };
  }, [onMapReady]);

  useEffect(() => {
    if (!navigator.geolocation) {
      setLocationStatus(`Showing ${DEFAULT_CENTER.label}`);
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

        userMarkerRef.current
          ?.setLngLat([nextCenter.lng, nextCenter.lat])
          .setPopup(
            new maplibregl.Popup({ offset: 25 }).setHTML(
              "<strong>Starting point</strong><br/>Your current location"
            )
          );
      },
      () => {
        setLocationStatus(`Showing ${DEFAULT_CENTER.label}`);
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
      if (!selectedLocation || !mapRef.current || !userLocation) return;

      const map = mapRef.current;

      setRouteError("");
      setRouteInfo(null);

      destinationMarkerRef.current?.remove();

      destinationMarkerRef.current = new maplibregl.Marker({
        color: "#2563eb",
      })
        .setLngLat([selectedLocation.lng, selectedLocation.lat])
        .setPopup(
          new maplibregl.Popup({ offset: 25 }).setHTML(
            `<strong>Ending point</strong><br/>${selectedLocation.name}`
          )
        )
        .addTo(map);

      const route = await getRouteBetweenPoints(userLocation, selectedLocation);

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
          "line-color": "#16a34a",
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
          top: 150,
          bottom: 130,
          left: 80,
          right: 80,
        },
        duration: 1200,
      });

      setRouteInfo({
        from: "Your current location",
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

  return (
    <div className="absolute inset-0 bg-slate-900">
      <div ref={mapContainerRef} className="absolute inset-0 h-full w-full" />

      <div className="pointer-events-none absolute inset-0 bg-slate-950/10" />

      <div className="pointer-events-none absolute left-3 top-24 z-10 rounded-full bg-white/90 px-3 py-1 text-xs font-black text-slate-700 shadow sm:left-5 sm:top-28">
        {locationStatus}
      </div>

      {routeInfo && (
        <div className="absolute bottom-6 left-4 z-30 w-[calc(100%-2rem)] max-w-md rounded-3xl bg-white/95 p-4 text-slate-950 shadow-2xl backdrop-blur">
          <p className="text-xs font-black uppercase tracking-wide text-green-600">
            Recommended Route
          </p>

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

          <div className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs font-bold text-slate-500">
            <span className="h-3 w-3 rounded-full bg-green-600 mt-1" />
            <span>Start: {routeInfo.from}</span>

            <span className="h-3 w-3 rounded-full bg-blue-600 mt-1" />
            <span>End: {routeInfo.to}</span>
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