import { t } from "../../../i18n";

// KAI — permission before anything is sent to the AI provider.
//
// App Store Review Guideline 5.1.2(i): personal data may only go to a
// third-party AI after the app says who receives it and the person agrees.
// runAiTask awaits ensureAiConsent() before every request, so no screen can
// skip it. The answer is remembered on this device; a "Not now" asks again the
// next time the person uses KAI.

export const AI_CONSENT_EVENT = "kunthai-ai-consent";
export const AI_CONSENT_DECLINED = "consent_declined";
const CONSENT_KEY = "kunthai.ai.consent.v1";

let grantedThisSession = false;
let pending = null;

export function hasAiConsent() {
  if (grantedThisSession) return true;
  try {
    return localStorage.getItem(CONSENT_KEY) === "granted";
  } catch {
    return false;
  }
}

function rememberConsent() {
  grantedThisSession = true;
  try {
    localStorage.setItem(CONSENT_KEY, "granted");
  } catch {
    // Kept in memory for this session; asked again after a restart.
  }
}

/** Resolves true once the person has allowed KAI, false when they decline. */
export function ensureAiConsent() {
  if (hasAiConsent()) return Promise.resolve(true);
  if (typeof window === "undefined") return Promise.resolve(false);
  // Requests fired together share one prompt.
  if (pending) return pending;

  pending = new Promise((resolve) => {
    const detail = { handled: false, resolve };
    window.dispatchEvent(new CustomEvent(AI_CONSENT_EVENT, { detail }));
    // AiAssistantHost shows the prompt; without it, the system dialog asks.
    if (!detail.handled) resolve(window.confirm(`${t("aiConsent.title")}\n\n${t("aiConsent.body")}`));
  }).then((granted) => {
    pending = null;
    if (granted) rememberConsent();
    return Boolean(granted);
  });

  return pending;
}
