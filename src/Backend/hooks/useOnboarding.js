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
        }
      } finally {
        if (active) {
          setLoading(false);
          setChecked(true);
        }
      }
    }

    load();

    return () => {
      active = false;
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
