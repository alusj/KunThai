import { useEffect } from "react";

import supabase from "../lib/supabaseClient";
import { decodeTokenPayload, isOversizedToken, oversizedMetadataPatch } from "../services/sessionSize";

// Once per sign-in: if the account's token has grown too large (sessionSize.js),
// clear the oversized metadata and fetch a fresh, small token.
export function useSessionSizeGuard({ ready = false, userId = "" } = {}) {
  useEffect(() => {
    if (!ready || !userId) return;
    let cancelled = false;

    (async () => {
      const { data } = await supabase.auth.getSession();
      const accessToken = data?.session?.access_token;
      if (cancelled || !isOversizedToken(accessToken)) return;
      const metadata = decodeTokenPayload(accessToken)?.user_metadata || data?.session?.user?.user_metadata;
      const patch = oversizedMetadataPatch(metadata);
      if (!patch) return;
      const { error } = await supabase.auth.updateUser({ data: patch });
      if (!error && !cancelled) await supabase.auth.refreshSession();
    })().catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [ready, userId]);
}
