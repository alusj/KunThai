import { APPLICATION_STATUS_LABELS, APPLICATION_TYPE_LABELS } from "../../../../Backend/services/explore/joinKunThaiService";
import { t as i18nText } from "../../../../i18n/index";

// Application status and type in the viewer's language; the English labels
// remain the fallback for a status this app version does not know yet.
export function joinStatusLabel(status) {
  const key = `exploreMessagesFix.joinStatus.${status}`;
  const translated = i18nText(key);
  return translated !== key ? translated : APPLICATION_STATUS_LABELS[status] || status || "";
}

export function joinTypeLabel(type) {
  const key = `exploreMessagesFix.joinType.${type}`;
  const translated = i18nText(key);
  return translated !== key ? translated : APPLICATION_TYPE_LABELS[type] || type || "";
}
