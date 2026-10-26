// "Share my profile": one link and one QR code per public profile — an
// Explore profile (a person or a Space), a UrMall seller, a UrRide fleet (solo
// operator) or a UrRide company.
//
// The link is the public website with the profile in the hash, e.g.
//   https://kunthai.app/?<invite code>#urmall-seller-<businessId>
// A phone with KunThai installed opens it in the app (universal links /
// verified app links: public/.well-known, the iOS Associated Domains
// entitlement and the Android intent filter); any other phone opens the
// website. Either way KunThai opens that profile once the person is on the
// main screens. On the web the hash is read the moment this module loads
// (before sign-in can clear it); in the app the link arrives through
// appUrlOpen / getLaunchUrl. It is kept for the session until opened.

import { Capacitor } from "@capacitor/core";
import { Share } from "@capacitor/share";
import { encode } from "uqr";

import { publicAppOrigin } from "./nativeShare";
import { captureVisibilityInviteFromUrl, decorateShareUrl } from "./visibilityCreditService";
import { openSharedExploreProfile, openSharedMarketplaceSeller } from "./ai/aiEntityNavigation";

const LINK_PREFIX = {
  person: "kunthai-profile",
  space: "kunthai-space",
  seller: "urmall-seller",
  operator: "urride-fleet",
  company: "urride-company",
};
const KIND_FOR_PREFIX = Object.fromEntries(Object.entries(LINK_PREFIX).map(([kind, prefix]) => [prefix, kind]));
const LINK_PATTERN = /^#(kunthai-profile|kunthai-space|urmall-seller|urride-fleet|urride-company)-([0-9a-z-]{6,80})(?:[?&].*)?$/i;
const PENDING_KEY = "kunthai-pending-profile-link";

export function buildProfileShareUrl(kind, id) {
  const prefix = LINK_PREFIX[kind];
  if (!prefix || !id) return "";
  return `${publicAppOrigin()}/#${prefix}-${encodeURIComponent(String(id))}`;
}

/** The profile link with the sharer's invite code, so a join credits them. */
export async function buildDecoratedProfileShareUrl(kind, id) {
  const url = buildProfileShareUrl(kind, id);
  if (!url) return "";
  try {
    return await decorateShareUrl(url);
  } catch {
    return url;
  }
}

// A place ("Share address"): Area View opens there and routes to it, in the
// app or on the website. #urride-place-<lat>,<lng>~<label>, or without
// coordinates #urride-place-~<address> (Area View searches the address).
const PLACE_PATTERN = /^#urride-place-(?:(-?\d{1,2}(?:\.\d+)?),(-?\d{1,3}(?:\.\d+)?))?(?:~(.*))?$/i;
const PLACE_LABEL_MAX = 160;

export function buildPlaceShareUrl({ lat, lng, label = "" } = {}) {
  const latitude = Number(lat);
  const longitude = Number(lng);
  const placed = lat !== null && lat !== undefined && lat !== "" && lng !== null && lng !== undefined && lng !== ""
    && Number.isFinite(latitude) && Number.isFinite(longitude)
    && Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180;
  const text = String(label || "").replace(/\s+/g, " ").trim().slice(0, PLACE_LABEL_MAX);
  if (!placed && !text) return "";
  const point = placed ? `${latitude.toFixed(6)},${longitude.toFixed(6)}` : "";
  return `${publicAppOrigin()}/#urride-place-${point}${text ? `~${encodeURIComponent(text)}` : ""}`;
}

function parsePlaceHash(hash = "") {
  const match = String(hash || "").match(PLACE_PATTERN);
  if (!match) return null;
  let label = "";
  try {
    label = match[3] ? decodeURIComponent(match[3]).slice(0, PLACE_LABEL_MAX) : "";
  } catch {
    label = "";
  }
  const lat = match[1] !== undefined ? Number(match[1]) : null;
  const lng = match[2] !== undefined ? Number(match[2]) : null;
  const placed = Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
  if (!placed && !label) return null;
  return { kind: "place", id: placed ? `${lat},${lng}` : "address", lat: placed ? lat : null, lng: placed ? lng : null, label };
}

export function parseProfileLinkHash(hash = "") {
  const place = parsePlaceHash(hash);
  if (place) return place;
  const match = String(hash || "").match(LINK_PATTERN);
  if (!match) return null;
  const kind = KIND_FOR_PREFIX[match[1].toLowerCase()];
  return kind ? { kind, id: decodeURIComponent(match[2]) } : null;
}

function rememberPending(link) {
  try {
    if (link) sessionStorage.setItem(PENDING_KEY, JSON.stringify(link));
  } catch {
    // Without storage the in-memory copy below still opens it this session.
  }
}

let pendingLink = null;
if (typeof window !== "undefined") {
  pendingLink = parseProfileLinkHash(window.location.hash);
  rememberPending(pendingLink);
}

/** Fired when the installed app is opened by a profile link (see installProfileAppLinks). */
export const PROFILE_LINK_EVENT = "kunthai-profile-link";

let lastAppLink = { url: "", at: 0 };

function deliverAppLink(rawUrl) {
  const url = String(rawUrl || "");
  // Keep the sharer's ?kt_ref= code so an account created now credits them.
  captureVisibilityInviteFromUrl(url);
  let link = null;
  try {
    link = parseProfileLinkHash(new URL(url).hash);
  } catch {
    return;
  }
  if (!link) return;
  // A cold start can report the same link through both getLaunchUrl and appUrlOpen.
  const now = Date.now();
  if (lastAppLink.url === url && now - lastAppLink.at < 5000) return;
  lastAppLink = { url, at: now };
  pendingLink = link;
  rememberPending(link);
  window.dispatchEvent(new CustomEvent(PROFILE_LINK_EVENT));
}

let appLinksInstalled = false;

/** In the app: listen for kunthai.app profile links (warm start) and read the launch link (cold start). */
export function installProfileAppLinks() {
  if (appLinksInstalled || typeof window === "undefined" || !isNative()) return;
  appLinksInstalled = true;
  import("@capacitor/app")
    .then(({ App }) => {
      App.addListener("appUrlOpen", (event) => deliverAppLink(event?.url));
      App.getLaunchUrl()
        .then((result) => {
          if (result?.url) deliverAppLink(result.url);
        })
        .catch(() => {});
    })
    .catch(() => {
      appLinksInstalled = false;
    });
}

/** Reads (and forgets) a profile link the app was opened with. */
export function takePendingProfileLink() {
  let link = pendingLink;
  pendingLink = null;
  try {
    const stored = JSON.parse(sessionStorage.getItem(PENDING_KEY) || "null");
    if (!link && stored?.kind && stored?.id) link = stored;
    sessionStorage.removeItem(PENDING_KEY);
  } catch {
    // Storage is optional.
  }
  return link;
}

/** Opens a shared profile on its home surface (switching section first). */
export function openSharedProfile(link) {
  if (!link?.kind || !link?.id || typeof window === "undefined") return;
  if (link.kind === "person") {
    openSharedExploreProfile({ userId: link.id });
    return;
  }
  if (link.kind === "space") {
    openSharedExploreProfile({ spaceId: link.id });
    return;
  }
  if (link.kind === "seller") {
    openSharedMarketplaceSeller({ id: link.id });
    return;
  }
  if (link.kind === "place") {
    const placed = Number.isFinite(link.lat) && Number.isFinite(link.lng);
    window.dispatchEvent(new CustomEvent("kuntai-open-area-view", {
      detail: {
        autoRoute: true,
        destination: {
          id: `shared-place-${link.id}`,
          type: "shared-place",
          name: link.label || "Shared address",
          label: link.label || "Shared address",
          address: link.label || "",
          ...(placed ? { lat: link.lat, lng: link.lng } : { searchQuery: link.label }),
        },
        source: "shared-place-link",
      },
    }));
    return;
  }
  const target = link.kind === "company" ? `urride:company:${link.id}` : `urride:fleet:${link.id}`;
  window.dispatchEvent(new CustomEvent("kuntai-return-main-page", { detail: { page: "transport", target } }));
}

// ---- QR code -------------------------------------------------------------

/** QR modules for a link; high error correction so a logo can sit on top. */
export function encodeProfileQr(value) {
  return encode(String(value || ""), { ecc: "H", border: 0 });
}

/** One SVG path for all dark modules (fast to draw, crisp at any size). */
export function qrModulesPath(qr) {
  const parts = [];
  qr.data.forEach((row, y) => {
    row.forEach((dark, x) => {
      if (dark) parts.push(`M${x} ${y}h1v1h-1z`);
    });
  });
  return parts.join("");
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = src;
  });
}

function roundedRect(context, x, y, width, height, radius) {
  context.beginPath();
  context.moveTo(x + radius, y);
  context.arcTo(x + width, y, x + width, y + height, radius);
  context.arcTo(x + width, y + height, x, y + height, radius);
  context.arcTo(x, y + height, x, y, radius);
  context.arcTo(x, y, x + width, y, radius);
  context.closePath();
}

/**
 * A shareable QR card as a PNG data URL: white card, the QR with the KunThai
 * logo in the middle, the profile name and "Scan to open on KunThai" below.
 */
export async function renderProfileQrPng({ url, title = "", caption = "" }) {
  const qr = encodeProfileQr(url);
  const scale = 1080;
  const padding = 96;
  const qrSize = scale - padding * 2;
  const cell = qrSize / qr.size;
  const canvas = document.createElement("canvas");
  canvas.width = scale;
  canvas.height = scale + 220;
  const context = canvas.getContext("2d");

  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);

  context.fillStyle = "#0f172a";
  qr.data.forEach((row, y) => {
    row.forEach((dark, x) => {
      if (dark) context.fillRect(padding + x * cell, padding + y * cell, Math.ceil(cell), Math.ceil(cell));
    });
  });

  const logoBox = qrSize * 0.22;
  const logoX = padding + (qrSize - logoBox) / 2;
  const logoY = padding + (qrSize - logoBox) / 2;
  context.fillStyle = "#ffffff";
  roundedRect(context, logoX - 12, logoY - 12, logoBox + 24, logoBox + 24, 36);
  context.fill();
  try {
    const logo = await loadImage("/icons/kunthai-192.png");
    context.save();
    roundedRect(context, logoX, logoY, logoBox, logoBox, 28);
    context.clip();
    context.drawImage(logo, logoX, logoY, logoBox, logoBox);
    context.restore();
  } catch {
    // The QR still scans without the logo.
  }

  context.textAlign = "center";
  context.fillStyle = "#0f172a";
  context.font = "800 54px system-ui, -apple-system, sans-serif";
  context.fillText(String(title || "KunThai").slice(0, 32), scale / 2, scale + 70);
  context.fillStyle = "#64748b";
  context.font = "600 36px system-ui, -apple-system, sans-serif";
  context.fillText(String(caption || "").slice(0, 48), scale / 2, scale + 130);

  return canvas.toDataURL("image/png");
}

function isNative() {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

function fileSafeName(value = "") {
  return String(value || "kunthai").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "kunthai";
}

/**
 * Shares the QR card as an image. In the app it is written to the cache and
 * handed to the phone's share sheet; on the web it uses Web Share with a file
 * or, failing that, downloads the PNG. Returns false when the person cancels.
 */
export async function shareProfileQrImage({ url, title, caption, text }) {
  const dataUrl = await renderProfileQrPng({ url, title, caption });
  const fileName = `${fileSafeName(title)}-kunthai-qr.png`;

  try {
    if (isNative()) {
      const { Filesystem, Directory } = await import("@capacitor/filesystem");
      const written = await Filesystem.writeFile({
        path: fileName,
        data: dataUrl.split(",")[1],
        directory: Directory.Cache,
      });
      await Share.share({ title, text, files: [written.uri], dialogTitle: title });
      return true;
    }

    const blob = await (await fetch(dataUrl)).blob();
    const file = new File([blob], fileName, { type: "image/png" });
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title, text });
      return true;
    }

    const link = document.createElement("a");
    link.href = dataUrl;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    return true;
  } catch (error) {
    if (error?.name === "AbortError" || /cancel/i.test(String(error?.message || error))) return false;
    throw error;
  }
}
