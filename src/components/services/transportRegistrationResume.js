// Which UrRide registration a member saved last, so coming back opens it
// directly instead of the caution card and the solo/company choice.

function savedTime(draft) {
  const time = Date.parse(draft?.savedAt || "");
  return Number.isFinite(time) ? time : 0;
}

/** "solo", "company" or "" from the two saved drafts; the newest one wins. */
export function latestSavedRegistration(soloDraft, companyDraft) {
  if (!soloDraft && !companyDraft) return "";
  if (!companyDraft) return "solo";
  if (!soloDraft) return "company";
  return savedTime(companyDraft) > savedTime(soloDraft) ? "company" : "solo";
}
