export const SOCIAL_LINK_PLATFORMS = [
  { id: "facebook", label: "Facebook", hosts: ["facebook.com", "fb.com"] },
  { id: "instagram", label: "Instagram", hosts: ["instagram.com"] },
  { id: "tiktok", label: "TikTok", hosts: ["tiktok.com"] },
];

export function detectSocialPlatform(value = "") {
  const text = String(value || "").trim().toLowerCase();
  if (!text) return null;

  const withProtocol = /^https?:\/\//i.test(text) ? text : `https://${text}`;

  try {
    const url = new URL(withProtocol);
    const host = url.hostname.replace(/^www\./, "");
    return SOCIAL_LINK_PLATFORMS.find((platform) => platform.hosts.some((item) => host === item || host.endsWith(`.${item}`))) || null;
  } catch {
    return SOCIAL_LINK_PLATFORMS.find((platform) => text.includes(platform.id)) || null;
  }
}

export function normalizeSocialLinks(value) {
  const input = Array.isArray(value) ? value : [];
  return [0, 1, 2].map((index) => {
    const current = input[index] || {};
    const url = String(current.url || current.href || "").trim();
    const platform = detectSocialPlatform(url);
    return {
      id: current.id || `social-${index + 1}`,
      url,
      platform: platform?.id || current.platform || "",
      label: platform?.label || current.label || "",
    };
  });
}
