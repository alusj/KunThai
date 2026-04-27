import { useEffect, useState } from "react";

import { getOnboardingProfile } from "../services/onboardingService";

export function useOnboarding(session) {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(Boolean(session));
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let active = true;

    async function load() {
      if (!session) {
        setProfile(null);
        setLoading(false);
        return;
      }

      setLoading(true);

      try {
        const nextProfile = await getOnboardingProfile();
        if (active) {
          setProfile(nextProfile);
        }
      } finally {
        if (active) {
          setLoading(false);
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
    refresh() {
      setRefreshKey((value) => value + 1);
    },
    isComplete: Boolean(profile?.onboardingComplete),
  };
}
