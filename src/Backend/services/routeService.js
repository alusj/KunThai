const OPEN_ROUTE_SERVICE_KEY = import.meta.env.VITE_OPENROUTESERVICE_KEY;

export async function getRouteBetweenPoints(start, end) {
  if (!OPEN_ROUTE_SERVICE_KEY) {
    throw new Error("Missing VITE_OPENROUTESERVICE_KEY");
  }

  if (!start?.lat || !start?.lng || !end?.lat || !end?.lng) {
    throw new Error("Start and destination are required");
  }

  const response = await fetch(
    "https://api.openrouteservice.org/v2/directions/driving-car/geojson",
    {
      method: "POST",
      headers: {
        Authorization: OPEN_ROUTE_SERVICE_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        coordinates: [
          [start.lng, start.lat],
          [end.lng, end.lat],
        ],
      }),
    }
  );

  if (!response.ok) {
    throw new Error("Unable to calculate route");
  }

  const data = await response.json();
  const feature = data.features?.[0];

  if (!feature) {
    throw new Error("No route found");
  }

  return {
    geometry: feature.geometry,
    distanceMeters: feature.properties?.summary?.distance || 0,
    durationSeconds: feature.properties?.summary?.duration || 0,
  };
}

export function formatDistance(meters) {
  if (!meters) return "0 km";
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}

export function formatDuration(seconds) {
  if (!seconds) return "0 min";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const remaining = minutes % 60;
  return `${hours}h ${remaining}m`;
}