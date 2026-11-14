import { Check, CheckCheck, Clock3 } from "lucide-react";

import { t as i18nText } from "../../../i18n/index";

const ICONS = { sending: Clock3, sent: Check, delivered: CheckCheck, seen: CheckCheck };

// The ticks after the time on my bubble, with the word when showLabel is set
// (the newest of my messages). tone: "dark" (Explore), "emerald" (UrMall).
export default function MessageStatus({ state, showLabel = false, tone = "dark" }) {
  if (!state) return null;
  const Icon = ICONS[state] || Check;
  const label = i18nText(`messageReceipts.${state}`);
  const seenColor = tone === "emerald" ? "text-sky-200" : "text-sky-400";
  return (
    <span
      className={`ml-1 inline-flex items-center gap-0.5 align-middle ${state === "seen" ? seenColor : ""}`}
      aria-label={label}
      title={label}
    >
      <Icon size={13} strokeWidth={2.6} aria-hidden="true" />
      {showLabel ? <span>{label}</span> : null}
    </span>
  );
}
