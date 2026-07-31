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

export function normalizeAdvertPhone(value = "") {
  return String(value || "").trim().slice(0, 32);
}

export function getAdvertPhoneHref(value = "") {
  const phone = normalizeAdvertPhone(value);
  if (!phone) return "";

  const hasLeadingPlus = phone.startsWith("+");
  const digits = phone.replace(/\D/g, "");
  if (!digits) return "";
  return `tel:${hasLeadingPlus ? "+" : ""}${digits}`;
}

export function normalizeAdvertWhatsApp(value = "") {
  return String(value || "").trim().slice(0, 40);
}

// Build a wa.me chat link from an advert's WhatsApp field. The field may be a
// raw phone number or a wa.me / whatsapp.com link; both resolve to a URL that
// opens a WhatsApp conversation with an optional suggested message.
export function getAdvertWhatsAppUrl(value = "", message = "") {
  const raw = normalizeAdvertWhatsApp(value);
  if (!raw) return "";

  const query = message ? `?text=${encodeURIComponent(message)}` : "";

  if (/^https?:\/\//i.test(raw) || /wa\.me|whatsapp\.com/i.test(raw)) {
    const url = /^https?:\/\//i.test(raw) ? raw : `https://${raw.replace(/^\/+/, "")}`;
    if (query && !/[?&]text=/i.test(url)) {
      return url + (url.includes("?") ? `&text=${encodeURIComponent(message)}` : query);
    }
    return url;
  }

  const digits = raw.replace(/\D/g, "");
  if (digits.length < 6) return "";
  return `https://wa.me/${digits}${query}`;
}

export function formatAdvertType(value = "") {
  const labels = {
    offer: "Offer",
    service: "Service",
    event: "Event",
    "job-vacancy": "Job Vacancy",
    announcement: "Announcement",
  };
  const key = String(value || "").trim().toLowerCase();
  return labels[key] || "Advert";
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
  if (advert.lat === null || advert.lat === undefined || advert.lat === "" || advert.lng === null || advert.lng === undefined || advert.lng === "") {
    return false;
  }

  const lat = Number(advert.lat);
  const lng = Number(advert.lng);
  return Number.isFinite(lat)
    && Number.isFinite(lng)
    && lat >= -90
    && lat <= 90
    && lng >= -180
    && lng <= 180
    && !(lat === 0 && lng === 0);
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
