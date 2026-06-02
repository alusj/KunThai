import { useEffect, useState } from "react";

import { getOnboardingProfile } from "../services/onboardingService";

export function useOnboarding(session) {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(Boolean(session));
  const [checked, setChecked] = useState(!session);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let active = true;

    async function load() {
      setChecked(false);

      if (!session) {
        setProfile(null);
        setLoading(false);
        setChecked(true);
        return;
      }

      setLoading(true);

      try {
        const nextProfile = await getOnboardingProfile(session);
        if (active) {
          setProfile(nextProfile);
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

  return {
    profile,
    loading,
    checked,
    refresh() {
      setRefreshKey((value) => value + 1);
    },
    isComplete: checked && Boolean(profile?.onboardingComplete),
  };
}
