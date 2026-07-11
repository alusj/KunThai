import { useEffect, useRef, useState } from "react";

import LinkifiedText from "./LinkifiedText";

export default function ExpandablePostText({
  text = "",
  className = "",
  textClassName = "",
  controlClassName = "text-sky-700",
}) {
  const [expanded, setExpanded] = useState(false);
  const [expandable, setExpandable] = useState(false);
  const textRef = useRef(null);
  const value = String(text || "");

  useEffect(() => {
    setExpanded(false);
    setExpandable(false);
  }, [text]);

  // The text is clamped to one line; "Read more" only appears when the clamp
  // actually hides content. While expanded we keep the last measurement so
  // "Show less" stays available.
  useEffect(() => {
    if (expanded) return undefined;

    const node = textRef.current;
    if (!node) return undefined;

    function measure() {
      setExpandable(node.scrollHeight > node.clientHeight + 1);
    }

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [text, expanded]);

  if (!value.trim()) return null;

  return (
    <div className={className}>
      <p
        ref={textRef}
        className={`kuntai-break ${expanded ? "whitespace-pre-wrap" : "line-clamp-1"} ${textClassName}`}
      >
        <LinkifiedText text={value} />
      </p>
      {expandable ? (
        <button
          type="button"
          aria-expanded={expanded}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            setExpanded((current) => !current);
          }}
          onPointerDown={(event) => event.stopPropagation()}
          className={`kt-pressable mt-0.5 font-black ${controlClassName}`}
        >
          {expanded ? "Show less" : "Read more"}
        </button>
      ) : null}
    </div>
  );
}
