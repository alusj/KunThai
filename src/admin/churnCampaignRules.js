// Pure helpers for the churn campaign screen (Phase 5).

export const AUDIENCES = Object.freeze(["attention", "at_risk", "churned", "at_risk_churned"]);
export const HOLDOUT_OPTIONS = Object.freeze([10, 20, 5, 0]);
export const CAMPAIGN_CAP = 5000;

// A checked audience can be sent when someone would get the message and it is within the cap.
export function canSendPreview(preview) {
  if (!preview) return false;
  const target = Number(preview.targetEstimate) || 0;
  const eligible = Number(preview.eligible) || 0;
  return target > 0 && eligible <= (Number(preview.cap) || CAMPAIGN_CAP);
}

// Where a campaign is in its measuring window.
export function campaignProgress(row) {
  const days = Number(row?.windowDays) || 30;
  const since = Math.max(Number(row?.daysSinceSend) || 0, 0);
  return { final: Boolean(row?.final) || since >= days, day: Math.min(Math.max(since, 1), days), days };
}

export function languageName(code, locale = "en") {
  try {
    const name = new Intl.DisplayNames([locale || "en"], { type: "language" }).of(code);
    return name && name !== code ? name : code.toUpperCase();
  } catch {
    return String(code || "").toUpperCase();
  }
}
