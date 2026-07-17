import { useCallback, useEffect, useState } from "react";

import {
  fetchVisibilityCreditWallet,
  shareVisibilityInviteLink,
} from "../services/visibilityCreditService";

const DEFAULT_WALLET = {
  balance: 0,
  lifetimeEarned: 0,
  lifetimeSpent: 0,
  inviteCode: "",
  inviteUrl: "",
  rewardPerVerifiedInvite: 5,
};

export function useVisibilityCredits({ enabled = true } = {}) {
  const [wallet, setWallet] = useState(DEFAULT_WALLET);
  const [loading, setLoading] = useState(Boolean(enabled));
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    if (!enabled) {
      setWallet(DEFAULT_WALLET);
      setLoading(false);
      return DEFAULT_WALLET;
    }

    setLoading(true);
    setError("");
    try {
      const nextWallet = await fetchVisibilityCreditWallet();
      setWallet(nextWallet);
      return nextWallet;
    } catch (nextError) {
      setError(nextError.message || "Unable to load Visibility Credits.");
      return DEFAULT_WALLET;
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    let active = true;
    if (!enabled) {
      setWallet(DEFAULT_WALLET);
      setLoading(false);
      return undefined;
    }

    setLoading(true);
    fetchVisibilityCreditWallet()
      .then((nextWallet) => {
        if (active) setWallet(nextWallet);
      })
      .catch((nextError) => {
        if (active) setError(nextError.message || "Unable to load Visibility Credits.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [enabled]);

  const shareInvite = useCallback(async () => {
    const nextWallet = await shareVisibilityInviteLink();
    setWallet(nextWallet);
    return nextWallet;
  }, []);

  return {
    ...wallet,
    wallet,
    loading,
    error,
    refresh,
    shareInvite,
  };
}
