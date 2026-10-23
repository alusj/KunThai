import { t } from "../../../i18n";
import { liveCardLabelValues } from "../../services/liveDiscovery";

// "850 m" / "1.4 km" in the active language.
export function liveDistanceText(distance) {
  if (!distance) return "";
  return distance.unit === "m"
    ? t("urrideLiveDiscovery.distanceMeters", { value: distance.value })
    : t("urrideLiveDiscovery.distanceKilometres", { value: distance.value });
}

// The distance line for an operator who is sharing now, from the same label
// rules on every list ("Available near you", the fleet lists), so one operator
// never reads "0.7 km away" on one screen and "Within about 1.8 km" on another:
// a rough position (theirs or the passenger's) is said as rough. "" when
// nothing honest can be said.
export function liveDistanceLine(operator) {
  const label = liveCardLabelValues({ ...operator, liveAvailability: "available" });
  if (label?.kind === "distanceEta") {
    return t("urrideLiveDiscovery.distanceEta", { distance: liveDistanceText(label.distance), eta: label.eta });
  }
  if (label?.kind === "approxDistanceEta") {
    return t("urrideLocationTrust.approxDistanceEta", { distance: liveDistanceText(label.distance), eta: label.eta });
  }
  if (label?.kind === "veryClose") return t("urrideLocationTrust.veryClose");
  if (label?.kind === "withinAbout") return t("urrideLocationTrust.withinAbout", { distance: liveDistanceText(label.distance) });
  return "";
}
