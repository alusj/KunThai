import { useEffect, useState } from "react";

import { detectPublicCodeKind, resolvePublicCode } from "../services/publicCodeService";

// Debounced lookup for search bars: returns { pending, result, kind } for the
// current query. `kind` is set as soon as the text looks like a public ID so
// the UI can show a lookup state before the resolver answers.
export function usePublicCodeLookup(query) {
  const [state, setState] = useState({ pending: false, result: null, kind: "" });

  useEffect(() => {
    const kind = detectPublicCodeKind(query);
    if (!kind) {
      setState({ pending: false, result: null, kind: "" });
      return undefined;
    }

    let alive = true;
    setState({ pending: true, result: null, kind });
    const timer = window.setTimeout(() => {
      resolvePublicCode(query)
        .then((result) => {
          if (alive) setState({ pending: false, result, kind });
        })
        .catch(() => {
          if (alive) setState({ pending: false, result: null, kind });
        });
    }, 250);

    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
  }, [query]);

  return state;
}
