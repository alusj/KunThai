function cleanText(value) {
  return String(value || "").trim();
}

export function buildPublicCompanyTabs(profile) {
  const fleets = Array.isArray(profile?.fleets) ? profile.fleets : [];
  const rentals = Array.isArray(profile?.rentals) ? profile.rentals : [];
  const seen = new Set();
  const tabs = [];

  for (const fleet of fleets) {
    const label = cleanText(fleet.fleetType) || "Fleet";
    const key = label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "fleet";
    if (seen.has(key)) continue;
    seen.add(key);
    tabs.push({ id: `fleet:${key}`, label, fleetType: label, kind: "fleet" });
  }

  if (rentals.length) tabs.push({ id: "rentals", label: "Rentals", kind: "rentals" });
  tabs.push({ id: "reviews", label: "Reviews", kind: "reviews" });
  tabs.push({ id: "about", label: "About", kind: "about" });
  return tabs;
}
