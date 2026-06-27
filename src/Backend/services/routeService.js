const ROUTE_API_PATH = "/api/route-directions";

function hasValidPoint(point) {
  return Number.isFinite(Number(point?.lat)) && Number.isFinite(Number(point?.lng));
}

function normalizePoint(point) {
  return {
    lat: Number(point.lat),
    lng: Number(point.lng),
  };
}

function normalizeRouteFeature(feature) {
  return {
    geometry: feature.geometry,
    distanceMeters: feature.properties?.summary?.distance || 0,
    durationSeconds: feature.properties?.summary?.duration || 0,
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

function getApproximateRoute(start, end) {
  const distanceMeters = distanceInMeters(start, end);

  return {
    geometry: {
      type: "LineString",
      coordinates: [
        [start.lng, start.lat],
        [end.lng, end.lat],
      ],
    },
    distanceMeters,
    durationSeconds: Math.max(60, distanceMeters / 8),
    approximate: true,
  };
}

async function parseRouteResponse(response) {
  const data = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(data?.reason || data?.error || "Unable to calculate route");
  }

  if (data?.geometry) {
    return data;
  }

  const feature = data?.features?.[0];

  if (!feature) {
    throw new Error("No route found");
  }

  return normalizeRouteFeature(feature);
}

async function getRouteFromServer(start, end) {
  const response = await fetch(ROUTE_API_PATH, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ start, end }),
  });

  return parseRouteResponse(response);
}

async function getRouteFromOsrm(start, end) {
  const params = new URLSearchParams({
    overview: "full",
    geometries: "geojson",
    steps: "false",
  });
  const response = await fetch(
    `https://router.project-osrm.org/route/v1/driving/${start.lng},${start.lat};${end.lng},${end.lat}?${params}`,
  );
  const data = await response.json().catch(() => null);

  if (!response.ok || data?.code !== "Ok" || !data.routes?.[0]?.geometry) {
    throw new Error(data?.message || "Unable to calculate route");
  }

  const route = data.routes[0];

  return {
    geometry: route.geometry,
    distanceMeters: route.distance || 0,
    durationSeconds: route.duration || 0,
  };
}

export async function getRouteBetweenPoints(start, end) {
  if (!hasValidPoint(start) || !hasValidPoint(end)) {
    throw new Error("Start and destination are required");
  }

  const normalizedStart = normalizePoint(start);
  const normalizedEnd = normalizePoint(end);

  const routeAttempts = [getRouteFromServer, getRouteFromOsrm];

  for (const attempt of routeAttempts) {
    try {
      return await attempt(normalizedStart, normalizedEnd);
    } catch (error) {
      console.warn("[KunThai Route Attempt Failed]", error);
    }
  }

  return getApproximateRoute(normalizedStart, normalizedEnd);
}

export async function getRouteThroughPoints(points = []) {
  if (
    points.length < 2 ||
    points.some((point) => !hasValidPoint(point))
  ) {
    throw new Error("At least two valid route points are required");
  }

  const normalizedPoints = points.map(normalizePoint);

  const legs = await Promise.all(
    normalizedPoints.slice(0, -1).map(async (point, index) => {
      const route = await getRouteBetweenPoints(point, normalizedPoints[index + 1]);
      return {
        ...route,
        from: normalizedPoints[index],
        to: normalizedPoints[index + 1],
      };
    }),
  );

  const coordinates = legs.flatMap((leg, index) => {
    const legCoordinates = leg.geometry?.coordinates || [];
    return index === 0 ? legCoordinates : legCoordinates.slice(1);
  });

  return {
    geometry: {
      type: "LineString",
      coordinates,
    },
    distanceMeters: legs.reduce((total, leg) => total + leg.distanceMeters, 0),
    durationSeconds: legs.reduce((total, leg) => total + leg.durationSeconds, 0),
    approximate: legs.some((leg) => leg.approximate),
    legs,
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
