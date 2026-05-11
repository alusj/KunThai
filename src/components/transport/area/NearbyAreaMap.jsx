import { useEffect, useMemo, useState } from "react";

const DEFAULT_CENTER = {
  lat: 8.4657,
  lng: -13.2317,
  label: "Lumley, Freetown",
};

function buildOpenStreetMapEmbed(center) {
  const delta = 0.018;
  const bbox = [
    center.lng - delta,
    center.lat - delta,
    center.lng + delta,
    center.lat + delta,
  ].join(",");

  return `https://www.openstreetmap.org/export/embed.html?bbox=${encodeURIComponent(bbox)}&layer=mapnik&marker=${encodeURIComponent(`${center.lat},${center.lng}`)}`;
}

export default function NearbyAreaMap({ children, onLocationResolved }) {
  const [center, setCenter] = useState(DEFAULT_CENTER);
  const [locationStatus, setLocationStatus] = useState("Checking location...");

  useEffect(() => {
    if (!navigator.geolocation) {
      setLocationStatus(`Showing ${DEFAULT_CENTER.label}`);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const nextCenter = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          label: "Your current area",
        };

        setCenter(nextCenter);
        setLocationStatus("Using your current area");
        onLocationResolved?.(nextCenter);
      },
      () => {
        setLocationStatus(`Showing ${DEFAULT_CENTER.label}`);
      },
      {
        enableHighAccuracy: true,
        timeout: 8000,
        maximumAge: 60000,
      },
    );
  }, [onLocationResolved]);

  const mapUrl = useMemo(() => buildOpenStreetMapEmbed(center), [center]);

  return (
    <div className="absolute inset-0 bg-slate-900">
      <iframe
        title="Nearby area map"
        src={mapUrl}
        className="absolute inset-0 h-full w-full border-0"
        loading="lazy"
        referrerPolicy="no-referrer-when-downgrade"
      />
      <div className="absolute inset-0 bg-slate-950/20" />
      <div className="absolute left-3 top-24 z-10 rounded-full bg-white/90 px-3 py-1 text-xs font-black text-slate-700 shadow sm:left-5 sm:top-28">
        {locationStatus}
      </div>
      {children}
    </div>
  );
}
