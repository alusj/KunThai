import { Fragment } from "react";

import { openHashtagContent, openMentionContent } from "../../../Backend/services/explore/linkTokenService";

// Splits on @mention / #hashtag tokens so they can be rendered as inline
// actions inside post bodies and comments.
const TOKEN_PATTERN = /([@#][a-z0-9_]+)/gi;

function TokenButton({ token }) {
  const isMention = token.startsWith("@");
  const value = token.slice(1);

  function handleClick(event) {
    event.preventDefault();
    event.stopPropagation();
    if (isMention) {
      openMentionContent(value);
    } else {
      openHashtagContent(value);
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      onPointerDown={(event) => event.stopPropagation()}
      className={`kt-pressable inline font-black hover:underline ${isMention ? "text-violet-700" : "text-sky-700"}`}
    >
      {token}
    </button>
  );
}

// Renders text with @mentions and #hashtags as tappable inline tokens. Safe
// to use inside <p> elements — every node stays inline.
export default function LinkifiedText({ text = "" }) {
  const value = String(text || "");
  if (!value) return null;

  const parts = value.split(TOKEN_PATTERN);

  return (
    <>
      {parts.map((part, index) => (
        /^[@#][a-z0-9_]+$/i.test(part)
          ? <TokenButton key={`token-${index}`} token={part} />
          : <Fragment key={`text-${index}`}>{part}</Fragment>
      ))}
    </>
  );
}
