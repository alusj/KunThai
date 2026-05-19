function buildNearbyViewbox(center, radius = 0.35) {
  if (!center?.lat || !center?.lng) return "";

  const west = center.lng - radius;
  const north = center.lat + radius;
  const east = center.lng + radius;
  const south = center.lat - radius;

  return `${west},${north},${east},${south}`;
}

export async function searchLocations(query, center = null) {
  const searchText = query?.trim();

  if (!searchText || searchText.length < 2) {
    return [];
  }

  try {
    const viewbox = buildNearbyViewbox(center);

    const nearbyUrl = viewbox
      ? `https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&limit=8&bounded=1&viewbox=${encodeURIComponent(
          viewbox
        )}&q=${encodeURIComponent(searchText)}`
      : null;

    const globalUrl = `https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&limit=8&q=${encodeURIComponent(
      searchText
    )}`;

    const response = await fetch(nearbyUrl || globalUrl);

    if (!response.ok) {
      throw new Error("Location search failed");
    }

    let data = await response.json();

    if (!data.length && nearbyUrl) {
      const fallbackResponse = await fetch(globalUrl);
      data = fallbackResponse.ok ? await fallbackResponse.json() : [];
    }

    return data.map((place) => ({
      id: place.place_id,
      name: place.display_name,
      lat: Number(place.lat),
      lng: Number(place.lon),
    }));
  } catch (error) {
    console.error("Location search error:", error);
    return [];
  }
}