import { useLayoutEffect, useRef, useState } from "react";
import { t, useI18n } from "../../i18n";

const CLAMP_CLASS = { 2: "line-clamp-2", 3: "line-clamp-3", 4: "line-clamp-4" };

// Notification text that is shown in full when it fits, and otherwise clamped
// with a "Read more" toggle. The toggle is a span, not a button, because some
// notification cards are themselves one big button; it never opens the card.
export default function ExpandableText({ text, className = "", lines = 3 }) {
  useI18n();
  const ref = useRef(null);
  const [expanded, setExpanded] = useState(false);
  const [overflows, setOverflows] = useState(false);

  useLayoutEffect(() => {
    const node = ref.current;
    if (!node || expanded) return;
    setOverflows(node.scrollHeight - node.clientHeight > 1);
  }, [text, expanded, lines]);

  if (!text) return null;

  function toggle(event) {
    event.preventDefault();
    event.stopPropagation();
    setExpanded((current) => !current);
  }

  return (
    <>
      <p ref={ref} className={`${className} ${expanded ? "" : CLAMP_CLASS[lines] || CLAMP_CLASS[3]} whitespace-pre-line break-words`}>{text}</p>
      {overflows || expanded ? (
        <span
          role="button"
          tabIndex={0}
          onClick={toggle}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") toggle(event);
          }}
          className="mt-1 inline-block cursor-pointer text-xs font-black text-emerald-700"
        >
          {expanded ? t("urrideTripCard.showLess") : t("urrideTripCard.readMore")}
        </span>
      ) : null}
    </>
  );
}
