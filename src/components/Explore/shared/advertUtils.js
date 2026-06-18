export function getAdvertMeta(post = {}) {
  const mediaMeta = post.media_meta || post.mediaMeta || {};
  return mediaMeta?.advert && typeof mediaMeta.advert === "object" ? mediaMeta.advert : null;
}

export function getPostTitle(post = {}) {
  const mediaMeta = post.media_meta || post.mediaMeta || {};
  return String(mediaMeta?.title || "").trim().slice(0, 30);
}

export function isAdvertPost(post = {}) {
  return post.post_type === "advert" || post.category === "advert" || Boolean(getAdvertMeta(post));
}

export function normalizeAdvertUrl(value = "") {
  const text = String(value || "").trim();
  if (!text) return "";
  return /^https?:\/\//i.test(text) ? text : `https://${text}`;
}

export function formatAdvertSchedule(advert = {}) {
  if (!advert.date && !advert.time) return "";
  if (!advert.date) return advert.time;

  const date = new Date(`${advert.date}T${advert.time || "00:00"}`);
  if (Number.isNaN(date.getTime())) return [advert.date, advert.time].filter(Boolean).join(" ");

  return date.toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    ...(advert.time ? { hour: "numeric", minute: "2-digit" } : {}),
  });
}

export function hasAdvertCoordinates(advert = {}) {
  return Number.isFinite(Number(advert.lat)) && Number.isFinite(Number(advert.lng));
}

export function openAdvertAreaView(post, advert = {}) {
  if (!hasAdvertCoordinates(advert)) return;

  window.dispatchEvent(
    new CustomEvent("kuntai-open-area-view", {
      detail: {
        autoRoute: true,
        destination: {
          id: `advert-location-${post.id || Date.now()}`,
          name: advert.title || post.body || "Advert location",
          label: advert.title || "Advert location",
          address: advert.address || "Shared from Explore advertisement",
          type: "advert-location",
          status: "advert",
          lat: Number(advert.lat),
          lng: Number(advert.lng),
        },
        returnTo: "explore-advert",
        source: "explore-advert-location",
      },
    }),
  );
}
