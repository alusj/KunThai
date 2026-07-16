import { showToast } from "./toastService";

function getAppUrl(hash = "") {
  if (typeof window === "undefined") return "";
  const url = new URL(window.location.href);
  url.hash = hash;
  return url.toString();
}

async function copyText(text) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const input = document.createElement("textarea");
  input.value = text;
  input.setAttribute("readonly", "");
  input.style.position = "fixed";
  input.style.opacity = "0";
  document.body.appendChild(input);
  input.select();
  document.execCommand("copy");
  document.body.removeChild(input);
}

async function shareLink({ fallbackMessage, text, title, url }) {
  if (!url) return false;

  try {
    if (navigator.share) {
      await navigator.share({ title, text, url });
      return true;
    }

    await copyText(url);
    showToast(fallbackMessage || "Link copied for sharing.", "success");
    return true;
  } catch (error) {
    if (error?.name === "AbortError") return false;
    await copyText(url);
    showToast(fallbackMessage || "Link copied for sharing.", "success");
    return true;
  }
}

export function getKunThaiShareUrl() {
  return getAppUrl("explore");
}

export function getUrMallShareUrl() {
  return getAppUrl("marketplace");
}

export function shareKunThaiLink() {
  return shareLink({
    title: "KunThai",
    text: "Join me on KunThai for Explore, Spaces, UrMall, and everyday community tools.",
    url: getKunThaiShareUrl(),
    fallbackMessage: "KunThai link copied for sharing.",
  });
}

export function shareUrMallLink() {
  return shareLink({
    title: "UrMall on KunThai",
    text: "Discover products, sellers, and local business tools on UrMall by KunThai.",
    url: getUrMallShareUrl(),
    fallbackMessage: "UrMall link copied for sharing.",
  });
}

export function kunThaiShareToastOptions(overrides = {}) {
  return {
    title: overrides.title || "Share KunThai",
    duration: overrides.duration || 7000,
    actionLabel: overrides.actionLabel || "Share KunThai",
    onAction: overrides.onAction || shareKunThaiLink,
  };
}

export function urMallShareToastOptions(overrides = {}) {
  return {
    title: overrides.title || "Share UrMall",
    duration: overrides.duration || 7000,
    actionLabel: overrides.actionLabel || "Share UrMall",
    onAction: overrides.onAction || shareUrMallLink,
  };
}
