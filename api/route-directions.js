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

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return json(res, 405, {
      ok: false,
      reason: "Method not allowed.",
    });
  }

  const apiKey = process.env.OPENROUTESERVICE_KEY;

  if (!apiKey) {
    return json(res, 500, {
      ok: false,
      reason: "Missing OPENROUTESERVICE_KEY.",
    });
  }

  const { start, end } = req.body || {};

  if (!hasValidPoint(start) || !hasValidPoint(end)) {
    return json(res, 400, {
      ok: false,
      reason: "Start and destination are required.",
    });
  }

  const routeStart = normalizePoint(start);
  const routeEnd = normalizePoint(end);

  try {
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
      return json(res, response.status, {
        ok: false,
        reason: data?.error?.message || data?.message || "Unable to calculate route.",
      });
    }

    const feature = data?.features?.[0];

    if (!feature) {
      return json(res, 404, {
        ok: false,
        reason: "No route found.",
      });
    }

    return json(res, 200, {
      ok: true,
      geometry: feature.geometry,
      distanceMeters: feature.properties?.summary?.distance || 0,
      durationSeconds: feature.properties?.summary?.duration || 0,
    });
  } catch (error) {
    console.error("[KunThai Route Error]", error);

    return json(res, 500, {
      ok: false,
      reason: "Unable to calculate route.",
    });
  }
}
