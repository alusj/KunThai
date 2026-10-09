// A seller's website as a safe, clickable link: http(s) only, "https://" added
// to bare domains. Anything else (javascript:, mailto:, junk) is not linked.
export function sellerWebsiteLink(raw) {
  const value = String(raw || "").trim();
  if (!value || /\s/.test(value)) return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(value) ? value : `https://${value.replace(/^\/+/, "")}`;
  try {
    const url = new URL(withScheme);
    if (!["http:", "https:"].includes(url.protocol) || !url.hostname.includes(".")) return null;
    return { href: url.href, label: `${url.hostname.replace(/^www\./i, "")}${url.pathname === "/" ? "" : url.pathname}` };
  } catch {
    return null;
  }
}
