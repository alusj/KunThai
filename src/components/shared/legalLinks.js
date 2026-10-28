import { isNativeApp } from "../../Backend/lib/apiUrl.js";
import { legalConfig } from "../../config/legalConfig.js";

// Policy pages are public routes of the web app (/privacy, /terms,
// /policy-center/<slug>). The iOS / Android shell serves the app from its own
// local origin, where those routes don't exist and the web view ignores
// target="_blank", so a plain link there does nothing. In the app the page
// opens from the live site in the in-app browser; on the web the link's own
// href and target="_blank" open it in a new tab.
export function legalPageUrl(path) {
  return `${legalConfig.websiteUrl}${path}`;
}

export async function openLegalPage(event, path) {
  if (!isNativeApp()) return;
  event.preventDefault();
  const url = legalPageUrl(path);
  try {
    const { Browser } = await import("@capacitor/browser");
    await Browser.open({ url });
  } catch {
    window.open(url, "_blank", "noopener");
  }
}
