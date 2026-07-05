import { useEffect, useState } from "react";

import { buildProfileFromUser, getOnboardingProfile } from "../services/onboardingService";

const ONBOARDING_BOOT_TIMEOUT_MS = 2200;

export function useOnboarding(session) {
  const sessionId = session?.id || "";
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(Boolean(session));
  const [checked, setChecked] = useState(!session);
  const [checkedSessionId, setCheckedSessionId] = useState(sessionId);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let active = true;
    let timeoutId = null;

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
      const fallbackProfile = buildProfileFromUser(session);
      timeoutId = window.setTimeout(() => {
        if (!active) return;
        setProfile(fallbackProfile);
        setCheckedSessionId(session.id || "");
        setLoading(false);
        setChecked(true);
      }, ONBOARDING_BOOT_TIMEOUT_MS);

      try {
        const nextProfile = await getOnboardingProfile(session);
        if (active) {
          setProfile(nextProfile);
          setCheckedSessionId(session.id || "");
        }
      } catch {
        if (active) {
          setProfile(fallbackProfile);
          setCheckedSessionId(session.id || "");
        }
      } finally {
        window.clearTimeout(timeoutId);
        if (active) {
          setLoading(false);
          setChecked(true);
        }
      }
    }

    load();

    return () => {
      active = false;
      if (timeoutId) window.clearTimeout(timeoutId);
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
