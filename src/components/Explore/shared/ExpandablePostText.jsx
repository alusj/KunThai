import { useEffect, useMemo, useState } from "react";

const DEFAULT_LIMIT = 50;

export default function ExpandablePostText({
  text = "",
  limit = DEFAULT_LIMIT,
  className = "",
  textClassName = "",
  controlClassName = "text-sky-700",
}) {
  const [expanded, setExpanded] = useState(false);
  const characters = useMemo(() => Array.from(String(text || "")), [text]);
  const expandable = characters.length > limit;
  const visibleText = expandable && !expanded
    ? `${characters.slice(0, limit).join("").trimEnd()}...`
    : characters.join("");

  useEffect(() => setExpanded(false), [text]);

  if (!characters.length) return null;

  if (!expandable) {
    return <p className={`kuntai-break whitespace-pre-wrap ${className} ${textClassName}`}>{visibleText}</p>;
  }

  return (
    <button
      type="button"
      aria-expanded={expanded}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        setExpanded((current) => !current);
      }}
      onPointerDown={(event) => event.stopPropagation()}
      className={`block w-full cursor-pointer text-left ${className}`}
    >
      <span className={`kuntai-break whitespace-pre-wrap ${textClassName}`}>{visibleText}</span>
      <span className={`ml-1 inline font-black ${controlClassName}`}>
        {expanded ? "Show less" : "Read More"}
      </span>
    </button>
  );
}

