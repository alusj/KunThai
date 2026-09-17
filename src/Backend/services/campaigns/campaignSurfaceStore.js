import { useEffect, useMemo, useSyncExternalStore } from "react";

// Which KunThai interface a person is using, for admin campaign placement.
//
// App.jsx knows the main page (explore / marketplace / transport). The role
// inside that page is declared by the screen that owns it while mounted: the
// UrMall seller workspace, the UrRide operator dashboard and the company
// workspace. With no declaration, UrMall is the buyer interface and UrRide is
// the passenger interface.

const ROLES_BY_PAGE = {};
let version = 0;
const listeners = new Set();

function notify() {
  version += 1;
  listeners.forEach((listener) => listener());
}

function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getVersion() {
  return version;
}

export function setCampaignSurfaceRole(page, role, details = {}) {
  const current = ROLES_BY_PAGE[page];
  if (current?.role === role && current?.businessKind === (details.businessKind || "")) return;
  ROLES_BY_PAGE[page] = { role, businessKind: details.businessKind || "" };
  notify();
}

export function clearCampaignSurfaceRole(page, role) {
  if (ROLES_BY_PAGE[page]?.role !== role) return;
  delete ROLES_BY_PAGE[page];
  notify();
}

export function readCampaignSurface(page = "explore") {
  const declared = ROLES_BY_PAGE[page];
  if (page === "marketplace") return { page, role: declared?.role === "seller" ? "seller" : "buyer", businessKind: declared?.businessKind || "" };
  if (page === "transport") return { page, role: declared?.role || "passenger", businessKind: "" };
  return { page: "explore", role: "", businessKind: "" };
}

/** Declare the interface role for as long as a screen is mounted. */
export function useCampaignSurfaceRole(page, role, { businessKind = "", active = true } = {}) {
  useEffect(() => {
    if (!active || !role) return undefined;
    setCampaignSurfaceRole(page, role, { businessKind });
    return () => clearCampaignSurfaceRole(page, role);
  }, [active, businessKind, page, role]);
}

export function useCampaignSurface(page) {
  const current = useSyncExternalStore(subscribe, getVersion, getVersion);
  // `current` changes whenever any role changes, which re-reads the surface.
  return useMemo(() => readCampaignSurface(page), [page, current]); // eslint-disable-line react-hooks/exhaustive-deps
}
