import { useEffect, useState } from "react";

import { getOnboardingProfile } from "../services/onboardingService";

export function useOnboarding(session) {
  const sessionId = session?.id || "";
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(Boolean(session));
  const [checked, setChecked] = useState(!session);
  const [checkedSessionId, setCheckedSessionId] = useState(sessionId);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let active = true;
    let resolved = false;
    let retryId = null;

    async function load() {
      setChecked(false);

      if (!session) {
        setProfile(null);
        setCheckedSessionId("");
        setLoading(false);
        setChecked(true);
        return;
      }

      setLoading(true);

      try {
        const nextProfile = await getOnboardingProfile(session);
        if (active) {
          setProfile(nextProfile);
          setCheckedSessionId(session.id || "");
          resolved = true;
        }
      } catch {
        // Keep the destination unresolved after a failed account lookup. An
        // incomplete auth-metadata fallback can incorrectly route an existing
        // UrMall/UrRide account into onboarding. Retry silently without
        // exposing the wrong screen in the meantime.
        if (active) {
          retryId = window.setTimeout(() => setRefreshKey((value) => value + 1), 3000);
        }
        return;
      } finally {
        if (active && resolved) {
          setLoading(false);
          setChecked(true);
        }
      }
    }

    load();

    return () => {
      active = false;
      if (retryId) window.clearTimeout(retryId);
    };
  }, [session, refreshKey]);

  const sessionChanged = Boolean(sessionId && checkedSessionId !== sessionId);
  const resolvedProfile = sessionChanged ? null : profile;
  const resolvedChecked = sessionId ? checked && !sessionChanged : checked;
  const resolvedLoading = loading || sessionChanged;

  return {
    profile: resolvedProfile,
    loading: resolvedLoading,
    checked: resolvedChecked,
    refresh() {
      setRefreshKey((value) => value + 1);
    },
    isComplete: resolvedChecked && Boolean(resolvedProfile?.onboardingComplete),
  };
}
