function json(res, status, payload) {
  return res.status(status).json(payload);
}

function hasValidPoint(point) {
  return Number.isFinite(Number(point?.lat)) && Number.isFinite(Number(point?.lng));
}

function normalizePoint(point) {
  return {
    lat: Number(point.lat),
    lng: Number(point.lng),
  };
}

function toRadians(value) {
  return (value * Math.PI) / 180;
}

function distanceInMeters(start, end) {
  const earthRadius = 6371000;
  const lat1 = toRadians(start.lat);
  const lat2 = toRadians(end.lat);
  const deltaLat = toRadians(end.lat - start.lat);
  const deltaLng = toRadians(end.lng - start.lng);

  const a =
    Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
    Math.cos(lat1) *
      Math.cos(lat2) *
      Math.sin(deltaLng / 2) *
      Math.sin(deltaLng / 2);

  return earthRadius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function approximateRoute(start, end) {
  const distanceMeters = distanceInMeters(start, end);
  return {
    ok: true,
    approximate: true,
    geometry: {
      type: "LineString",
      coordinates: [
        [start.lng, start.lat],
        [end.lng, end.lat],
      ],
    },
    distanceMeters,
    durationSeconds: Math.max(60, distanceMeters / 8),
  };
}

function normalizeOpenRouteFeature(feature) {
  return {
    ok: true,
    geometry: feature.geometry,
    distanceMeters: feature.properties?.summary?.distance || 0,
    durationSeconds: feature.properties?.summary?.duration || 0,
  };
}

async function getOpenRouteServiceRoute(apiKey, routeStart, routeEnd) {
  if (!apiKey) throw new Error("Missing OPENROUTESERVICE_KEY.");

  const response = await fetch("https://api.openrouteservice.org/v2/directions/driving-car/geojson", {
    method: "POST",
    headers: {
      Authorization: apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      coordinates: [
        [routeStart.lng, routeStart.lat],
        [routeEnd.lng, routeEnd.lat],
      ],
    }),
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(data?.error?.message || data?.message || "Unable to calculate route.");
  }

  const feature = data?.features?.[0];
  if (!feature) throw new Error("No route found.");
  return normalizeOpenRouteFeature(feature);
}

async function getOsrmRoute(routeStart, routeEnd) {
  const params = new URLSearchParams({
    overview: "full",
    geometries: "geojson",
    steps: "false",
  });
  const response = await fetch(
    `https://router.project-osrm.org/route/v1/driving/${routeStart.lng},${routeStart.lat};${routeEnd.lng},${routeEnd.lat}?${params}`,
  );
  const data = await response.json().catch(() => null);

  if (!response.ok || data?.code !== "Ok" || !data.routes?.[0]?.geometry) {
    throw new Error(data?.message || "Unable to calculate route.");
  }

  const route = data.routes[0];
  return {
    ok: true,
    geometry: route.geometry,
    distanceMeters: route.distance || 0,
    durationSeconds: route.duration || 0,
  };
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return json(res, 405, {
      ok: false,
      reason: "Method not allowed.",
    });
  }

  const apiKey = process.env.OPENROUTESERVICE_KEY;

  const { start, end } = req.body || {};

  if (!hasValidPoint(start) || !hasValidPoint(end)) {
    return json(res, 400, {
      ok: false,
      reason: "Start and destination are required.",
    });
  }

  const routeStart = normalizePoint(start);
  const routeEnd = normalizePoint(end);

  const attempts = [
    () => getOpenRouteServiceRoute(apiKey, routeStart, routeEnd),
    () => getOsrmRoute(routeStart, routeEnd),
  ];

  for (const attempt of attempts) {
    try {
      return json(res, 200, await attempt());
    } catch (error) {
      console.warn("[KunThai Route Attempt Failed]", error);
    }
  }

  return json(res, 200, approximateRoute(routeStart, routeEnd));
}
