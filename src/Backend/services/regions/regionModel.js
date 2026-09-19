// Pure helpers for KunThai states / districts (kunthai_country_regions).
//
// The database owns the region list and each country's label ("State",
// "District", "County"…); these helpers only index, search and describe what
// kunthai_get_country_regions returned. They never invent regions.

export const MAX_TARGET_REGIONS = 30;

/** Lower-case, accent-free, punctuation-free text for matching. */
export function foldRegionText(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[''`‘’ʻʼ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Index the RPC bundle for fast lookups. Returns null for an empty bundle.
 * { countryIso, countryName, label, labelPlural, level, regions, byId, childrenOf }
 */
export function indexRegionBundle(bundle) {
  if (!bundle || !Array.isArray(bundle.regions)) return null;
  const regions = bundle.regions.map((region) => ({
    id: String(region.id),
    code: region.code || "",
    name: region.name || region.officialName || "",
    officialName: region.officialName || region.name || "",
    type: region.type || "",
    parentId: region.parentId ? String(region.parentId) : "",
    level: Number(region.level) || 1,
    aliases: Array.isArray(region.aliases) ? region.aliases : [],
  }));
  const byId = new Map(regions.map((region) => [region.id, region]));
  const childrenOf = new Map();
  for (const region of regions) {
    const key = region.parentId && byId.has(region.parentId) ? region.parentId : "";
    if (!childrenOf.has(key)) childrenOf.set(key, []);
    childrenOf.get(key).push(region);
  }
  for (const region of regions) {
    const parent = region.parentId ? byId.get(region.parentId) : null;
    region.parentName = parent?.name || "";
    region.hasChildren = childrenOf.has(region.id);
    region.search = {
      name: foldRegionText(region.name),
      words: foldRegionText(region.name).split(" "),
      extra: foldRegionText([region.officialName, ...region.aliases].join(" ")),
      context: foldRegionText([region.type, region.parentName, region.code].join(" ")),
    };
  }
  return {
    countryIso: bundle.countryIso || "",
    countryName: bundle.countryName || "",
    label: bundle.label || "Region",
    labelPlural: bundle.labelPlural || "Regions",
    level: Number(bundle.level) || 1,
    regions,
    byId,
    childrenOf,
  };
}

/** The region's ancestors and itself, root first. */
export function regionLineage(index, regionId) {
  const lineage = [];
  let current = index?.byId.get(String(regionId || ""));
  const seen = new Set();
  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    lineage.unshift(current);
    current = current.parentId ? index.byId.get(current.parentId) : null;
  }
  return lineage;
}

/** Every region under regionId (not including itself). */
export function regionDescendantIds(index, regionId) {
  const result = [];
  const stack = [...(index?.childrenOf.get(String(regionId || "")) || [])];
  while (stack.length) {
    const region = stack.pop();
    result.push(region.id);
    stack.push(...(index.childrenOf.get(region.id) || []));
  }
  return result;
}

/**
 * Search the country's regions. Ranks exact names, then name prefixes, word
 * prefixes, aliases (towns, English names), and finally parent/type matches.
 */
export function searchRegions(index, query, { limit = 60 } = {}) {
  if (!index) return [];
  const folded = foldRegionText(query);
  if (!folded) return index.regions.slice(0, limit);
  const scored = [];
  for (const region of index.regions) {
    const { name, words, extra, context } = region.search;
    let score = -1;
    if (name === folded) score = 0;
    else if (name.startsWith(folded)) score = 1;
    else if (words.some((word) => word.startsWith(folded))) score = 2;
    else if (` ${extra} `.includes(` ${folded} `)) score = 3;
    else if (name.includes(folded)) score = 4;
    else if (extra.includes(folded)) score = 5;
    else if (context.includes(folded)) score = 6;
    if (score >= 0) scored.push([score, region]);
  }
  return scored
    .sort((a, b) => a[0] - b[0] || a[1].level - b[1].level || a[1].name.localeCompare(b[1].name))
    .slice(0, limit)
    .map(([, region]) => region);
}

/** A stored selection item: enough to show a chip without reloading regions. */
export function toRegionSelection(region, countryIso = "") {
  if (!region?.id) return null;
  return {
    id: String(region.id),
    name: String(region.name || ""),
    type: String(region.type || ""),
    parentName: String(region.parentName || ""),
    countryIso: String(region.countryIso || countryIso || "").toUpperCase(),
  };
}

/** Deduplicate and clean a saved selection (from forms, drafts or metadata). */
export function normalizeRegionSelection(list, max = MAX_TARGET_REGIONS) {
  const seen = new Set();
  const result = [];
  for (const item of Array.isArray(list) ? list : []) {
    const clean = typeof item === "string" ? { id: item, name: "" } : toRegionSelection(item);
    if (!clean?.id || seen.has(clean.id)) continue;
    seen.add(clean.id);
    result.push(clean);
    if (result.length >= max) break;
  }
  return result;
}

export function regionSelectionIds(list) {
  return normalizeRegionSelection(list, 500).map((item) => item.id);
}

/** The selected region that already covers regionId (itself or an ancestor). */
export function coveringSelection(index, selection, regionId) {
  const ids = new Set(regionSelectionIds(selection));
  return regionLineage(index, regionId).find((region) => ids.has(region.id)) || null;
}

/**
 * Toggle a region in a multi-selection. Choosing a province/state removes its
 * districts from the list (they are included); a region already covered by a
 * chosen parent cannot be added separately.
 */
export function toggleRegionSelection(index, selection, region, { max = MAX_TARGET_REGIONS } = {}) {
  const current = normalizeRegionSelection(selection, 500);
  if (!region?.id) return current;
  if (current.some((item) => item.id === region.id)) return current.filter((item) => item.id !== region.id);
  const cover = coveringSelection(index, current, region.id);
  if (cover && cover.id !== region.id) return current;
  const descendants = new Set(regionDescendantIds(index, region.id));
  const next = current.filter((item) => !descendants.has(item.id));
  if (next.length >= max) return next;
  return [...next, toRegionSelection(region, index?.countryIso)];
}

/** "Kambia, Port Loko and 2 more" style summary. */
export function describeRegionSelection(selection, { max = 3, andMore = (count) => `+${count}` } = {}) {
  const names = normalizeRegionSelection(selection, 500).map((item) => item.name).filter(Boolean);
  if (names.length <= max) return names.join(", ");
  return `${names.slice(0, max).join(", ")} ${andMore(names.length - max)}`;
}

/**
 * Does a viewer located in `viewerPath` (their region and its ancestors) fall
 * inside a promotion limited to `targetIds`? Empty targets = everywhere.
 */
export function isInsideTargetRegions(viewerPath, targetIds) {
  const targets = Array.isArray(targetIds) ? targetIds.filter(Boolean).map(String) : [];
  if (!targets.length) return true;
  const path = new Set((Array.isArray(viewerPath) ? viewerPath : []).map(String));
  return targets.some((id) => path.has(id));
}
