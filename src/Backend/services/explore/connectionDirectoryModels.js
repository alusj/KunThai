function getConnectionDirectoryKey(item = {}) {
  const identityType = item.identity_type || item.identityType || item.targetType || (item.space_id ? "space" : "profile");
  const identityId = item.identity_id || item.identityId || item.space_id || item.user_id || item.id || "";
  return identityId ? `${identityType}:${identityId}` : "";
}

/**
 * Keeps the ranked recommendations first, then appends every remaining
 * directory entry. This lets relevance improve discovery without turning the
 * ranking RPC's bounded result into a hidden account-directory limit.
 */
export function mergeExploreDiscoveryItems(prioritizedItems = [], directoryItems = []) {
  const merged = [];
  const seen = new Set();
  const eligibleKeys = new Set(directoryItems.map(getConnectionDirectoryKey).filter(Boolean));

  [...prioritizedItems, ...directoryItems].forEach((item) => {
    const key = getConnectionDirectoryKey(item);
    if (!key || seen.has(key) || !eligibleKeys.has(key)) return;
    seen.add(key);
    merged.push(item);
  });

  return merged;
}
