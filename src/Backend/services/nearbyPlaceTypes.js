// Every kind of place people can add in Nearby Area: its map pin icon and
// colour, the filter it belongs to, and the words that find it in search.
// Icon shapes are Lucide outlines (the app's icon set), kept as plain data so
// map pins can be drawn without React.

const ICON_NODES = {"shop":[["path",{"d":"M15 21v-5a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v5"}],["path",{"d":"M17.774 10.31a1.12 1.12 0 0 0-1.549 0 2.5 2.5 0 0 1-3.451 0 1.12 1.12 0 0 0-1.548 0 2.5 2.5 0 0 1-3.452 0 1.12 1.12 0 0 0-1.549 0 2.5 2.5 0 0 1-3.77-3.248l2.889-4.184A2 2 0 0 1 7 2h10a2 2 0 0 1 1.653.873l2.895 4.192a2.5 2.5 0 0 1-3.774 3.244"}],["path",{"d":"M4 10.95V19a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8.05"}]],"school":[["path",{"d":"M21.42 10.922a1 1 0 0 0-.019-1.838L12.83 5.18a2 2 0 0 0-1.66 0L2.6 9.08a1 1 0 0 0 0 1.832l8.57 3.908a2 2 0 0 0 1.66 0z"}],["path",{"d":"M22 10v6"}],["path",{"d":"M6 12.5V16a6 3 0 0 0 12 0v-3.5"}]],"supermarket":[["circle",{"cx":"8","cy":"21","r":"1"}],["circle",{"cx":"19","cy":"21","r":"1"}],["path",{"d":"M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12"}]],"pharmacy":[["path",{"d":"m10.5 20.5 10-10a4.95 4.95 0 1 0-7-7l-10 10a4.95 4.95 0 1 0 7 7Z"}],["path",{"d":"m8.5 8.5 7 7"}]],"hospital":[["path",{"d":"M12 7v4"}],["path",{"d":"M14 21v-3a2 2 0 0 0-4 0v3"}],["path",{"d":"M14 9h-4"}],["path",{"d":"M18 11h2a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-9a2 2 0 0 1 2-2h2"}],["path",{"d":"M18 21V5a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16"}]],"police":[["path",{"d":"M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"}],["path",{"d":"M12 8v4"}],["path",{"d":"M12 16h.01"}]],"fire":[["path",{"d":"M12 3q1 4 4 6.5t3 5.5a1 1 0 0 1-14 0 5 5 0 0 1 1-3 1 1 0 0 0 5 0c0-2-1.5-3-1.5-5q0-2 2.5-4"}]],"fuel":[["path",{"d":"M14 13h2a2 2 0 0 1 2 2v2a2 2 0 0 0 4 0v-6.998a2 2 0 0 0-.59-1.42L18 5"}],["path",{"d":"M14 21V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v16"}],["path",{"d":"M2 21h13"}],["path",{"d":"M3 9h11"}]],"garage":[["path",{"d":"M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.106-3.105c.32-.322.863-.22.983.218a6 6 0 0 1-8.259 7.057l-7.91 7.91a1 1 0 0 1-2.999-3l7.91-7.91a6 6 0 0 1 7.057-8.259c.438.12.54.662.219.984z"}]],"hotel":[["path",{"d":"M2 20v-8a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v8"}],["path",{"d":"M4 10V6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v4"}],["path",{"d":"M12 4v6"}],["path",{"d":"M2 18h20"}]],"atm":[["rect",{"width":"20","height":"12","x":"2","y":"6","rx":"2"}],["circle",{"cx":"12","cy":"12","r":"2"}],["path",{"d":"M6 12h.01M18 12h.01"}]],"pickup":[["path",{"d":"M19.43 12.935c.357-.967.57-1.955.57-2.935a8 8 0 0 0-16 0c0 4.993 5.539 10.193 7.399 11.799a1 1 0 0 0 1.202 0 32.197 32.197 0 0 0 .813-.728"}],["circle",{"cx":"12","cy":"10","r":"3"}],["path",{"d":"m16 18 2 2 4-4"}]],"park":[["path",{"d":"M8 6v6"}],["path",{"d":"M15 6v6"}],["path",{"d":"M2 12h19.6"}],["path",{"d":"M18 18h3s.5-1.7.8-2.8c.1-.4.2-.8.2-1.2 0-.4-.1-.8-.2-1.2l-1.4-5C20.1 6.8 19.1 6 18 6H4a2 2 0 0 0-2 2v10h3"}],["circle",{"cx":"7","cy":"18","r":"2"}],["path",{"d":"M9 18h5"}],["circle",{"cx":"16","cy":"18","r":"2"}]],"market":[["path",{"d":"m15 11-1 9"}],["path",{"d":"m19 11-4-7"}],["path",{"d":"M2 11h20"}],["path",{"d":"m3.5 11 1.6 7.4a2 2 0 0 0 2 1.6h9.8a2 2 0 0 0 2-1.6l1.7-7.4"}],["path",{"d":"M4.5 15.5h15"}],["path",{"d":"m5 11 4-7"}],["path",{"d":"m9 11 1 9"}]],"other":[["path",{"d":"M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0"}],["circle",{"cx":"12","cy":"10","r":"3"}]]};

export const SERVICES_CATEGORY = "Services";

// The order here is the order in the Add Location list.
export const NEARBY_PLACE_TYPES = [
  { category: "Shop", icon: "shop", color: "#7c3aed", filter: "Shops", words: ["shop", "store"] },
  { category: "School", icon: "school", color: "#2563eb", filter: "Schools", words: ["school", "college", "university"] },
  { category: "Supermarket", icon: "supermarket", color: "#9333ea", filter: "Shops", words: ["supermarket", "grocery"] },
  { category: "Pharmacy", icon: "pharmacy", color: "#0d9488", filter: "Shops", words: ["pharmacy", "drug store", "chemist", "medicine"] },
  { category: "Hospital / Clinic", icon: "hospital", color: "#dc2626", filter: "Emergency", words: ["hospital", "clinic", "health centre", "health center"] },
  { category: "Police", icon: "police", color: "#1d4ed8", filter: "Emergency", words: ["police"] },
  { category: "Fire Station", icon: "fire", color: "#ea580c", filter: "Emergency", words: ["fire station", "fire service", "fire force"] },
  { category: "Fuel Station", icon: "fuel", color: "#ca8a04", filter: SERVICES_CATEGORY, words: ["fuel", "petrol", "gas station", "filling station"] },
  { category: "Garage / Tyre Repair", icon: "garage", color: "#475569", filter: SERVICES_CATEGORY, words: ["garage", "mechanic", "tyre", "tire", "car repair", "vulcanizer"] },
  { category: "Hotel / Safe Stay", icon: "hotel", color: "#db2777", filter: SERVICES_CATEGORY, words: ["hotel", "guest house", "guesthouse", "lodge", "motel", "safe stay"] },
  { category: "ATM / Mobile Money", icon: "atm", color: "#16a34a", filter: SERVICES_CATEGORY, words: ["atm", "mobile money", "cash point", "bank"] },
  { category: "Pickup Point", icon: "pickup", color: "#059669", filter: "Pickup", words: ["pickup", "pick up", "pick-up"] },
  { category: "Transport Park", icon: "park", color: "#0284c7", filter: "Pickup", words: ["transport park", "bus park", "taxi park", "bus station", "motor park"] },
  { category: "Market", icon: "market", color: "#c2410c", filter: "Markets", words: ["market"] },
];

const OTHER_PLACE = { category: "Other", icon: "other", color: "#0f172a", filter: "Community", words: [] };

export const ADD_LOCATION_CATEGORIES = [...NEARBY_PLACE_TYPES.map((place) => place.category), "Other"];

function normalize(value) {
  return String(value || "").trim().toLowerCase();
}

// Word match, so "atm" is not found inside "treatment".
function hasWord(text, word) {
  return new RegExp(`(^|[^a-z0-9])${word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}($|[^a-z0-9])`).test(text);
}

/** The place type for a category or a typed "Other" name; Other when nothing fits. */
export function placeTypeForCategory(category) {
  const text = normalize(category);
  if (!text) return OTHER_PLACE;
  return NEARBY_PLACE_TYPES.find((place) => normalize(place.category) === text)
    || NEARBY_PLACE_TYPES.find((place) => place.words.some((word) => hasWord(text, word)))
    || OTHER_PLACE;
}

/** The place type of a location row from the map. */
export function placeTypeForLocation(location = {}) {
  return placeTypeForCategory(location.type || location.raw?.type || location.raw?.category || location.category);
}

/** A white outline icon for a place type, as SVG markup for a map pin. */
export function placeIconSvg(place, size = 20) {
  const body = (ICON_NODES[place?.icon] || ICON_NODES.other)
    .map(([tag, attributes]) => `<${tag} ${Object.entries(attributes).map(([name, value]) => `${name}="${value}"`).join(" ")}/>`)
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
}

/**
 * Approved KunThai places matching what was searched, nearest list order kept:
 * by name, address or landmark, or by kind ("car repair" finds a garage).
 */
export function matchApprovedPlaces(locations = [], query = "", limit = 6) {
  const text = normalize(query);
  if (text.length < 2) return [];
  return locations
    .filter((location) => {
      if (location?.lat == null || location?.lng == null) return false;
      const place = placeTypeForLocation(location);
      const own = [location.name, location.address, location.landmark, location.type].map(normalize).join(" ");
      return own.includes(text) || place.words.some((word) => (text.length >= 3 && word.includes(text)) || hasWord(text, word));
    })
    .slice(0, limit);
}

/** A map search result for an approved KunThai place. */
export function approvedPlaceToSearchResult(location) {
  const address = [location.address, location.landmark].filter(Boolean).join(", ");
  return {
    id: `kunthai-${location.id}`,
    name: location.name,
    label: location.name,
    placeName: location.name,
    address: address || location.type || "",
    fullAddress: [location.name, address].filter(Boolean).join(", "),
    category: location.type || location.category || "",
    lat: location.lat,
    lng: location.lng,
    verifiedPlace: true,
  };
}
