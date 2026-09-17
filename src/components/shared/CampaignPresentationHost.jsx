import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import supabase from "../../Backend/lib/supabaseClient";
import {
  campaignContentFromRow,
  campaignRowStillPresentable,
  resolvePresentationSettings,
  selectCampaignPresentations,
} from "../../Backend/services/campaigns/campaignModel";
import {
  recordCampaignClick,
  recordCampaignDismissed,
  recordCampaignPresented,
  subscribeToCampaignDeliveries,
} from "../../Backend/services/campaigns/campaignDeliveryService";
import { useCampaignSurface } from "../../Backend/services/campaigns/campaignSurfaceStore";
import { mapSurfacePlatformNotification } from "../../Backend/services/surfaceNotificationModels";
import { openUnifiedNotification } from "../../Backend/services/unifiedNotificationService";
import AppPortal from "./AppPortal";
import CampaignPresentation from "./campaigns/CampaignPresentation";

// Shows admin campaigns on the KunThai interface they were aimed at: floating
// cards, banners, bottom sheets, modals and critical alerts (one at a time)
// plus one inline card. Every view, tap and dismissal is written back to the
// person's delivery row, which is what the admin campaign analytics count.

const IN_APP_PRESENTATIONS = ["floating", "floating_inbox", "inline", "inline_inbox", "banner", "bottom_sheet", "modal", "critical", "fullscreen", "urgent"];
const EMPTY_SLOT = { row: null, leaving: false };

function sessionKey(userId, rowId) {
  return `kunthai-campaign-shown:${userId}:${rowId}`;
}

function seenInSession(userId, rowId) {
  try {
    return window.sessionStorage.getItem(sessionKey(userId, rowId)) === "1";
  } catch {
    return false;
  }
}

function markSeenInSession(userId, rowId) {
  try {
    window.sessionStorage.setItem(sessionKey(userId, rowId), "1");
  } catch {
    // Private browsing can block storage; presentation_count still limits repeats.
  }
}

function settingsFor(row) {
  return row ? resolvePresentationSettings(row.display_config || {}, row.presentation) : null;
}

export default function CampaignPresentationHost({ currentPage = "explore", userId = "", bottomTabsHidden = false }) {
  const surface = useCampaignSurface(currentPage);
  const [slots, setSlots] = useState({ overlay: EMPTY_SLOT, inline: EMPTY_SLOT });
  const slotsRef = useRef(slots);
  const surfaceRef = useRef(surface);
  const timersRef = useRef({});
  const loadingRef = useRef(false);
  const pendingRef = useRef(false);

  useEffect(() => {
    slotsRef.current = slots;
  }, [slots]);

  const updateSlot = useCallback((name, value) => {
    setSlots((current) => {
      const next = { ...current, [name]: value };
      slotsRef.current = next;
      return next;
    });
  }, []);

  const clearSlot = useCallback((name) => {
    window.clearTimeout(timersRef.current[name]);
    updateSlot(name, EMPTY_SLOT);
  }, [updateSlot]);

  const load = useCallback(async () => {
    if (!userId) return;
    if (loadingRef.current) {
      pendingRef.current = true;
      return;
    }
    loadingRef.current = true;
    try {
      const [{ data: rows, error }, { data: preferences }] = await Promise.all([
        supabase
          .from("platform_notifications")
          .select("*")
          .eq("user_id", userId)
          .eq("status", "unread")
          .in("presentation", IN_APP_PRESENTATIONS)
          .order("created_at", { ascending: false })
          .limit(50),
        supabase.from("user_notification_preferences").select("in_app_enabled,floating_enabled").eq("user_id", userId).maybeSingle(),
      ]);
      if (error) return;
      const currentSurface = surfaceRef.current;
      const byId = new Map((rows || []).map((row) => [row.id, row]));
      const choice = selectCampaignPresentations(rows || [], currentSurface, {
        preferences: preferences || {},
        seenThisSession: (row) => seenInSession(userId, row.id),
      });

      ["overlay", "inline"].forEach((name) => {
        const slot = slotsRef.current[name];
        if (slot.row) {
          if (slot.leaving) return;
          // A card stays until it closes, unless it stopped belonging here
          // (the person left that interface, or read it in an inbox).
          const latest = byId.get(slot.row.id);
          if (!campaignRowStillPresentable(latest, currentSurface)) clearSlot(name);
          return;
        }
        const next = choice[name];
        if (!next) return;
        markSeenInSession(userId, next.id);
        updateSlot(name, { row: next, leaving: false });
        recordCampaignPresented(next).catch(() => {});
      });
    } finally {
      loadingRef.current = false;
      if (pendingRef.current) {
        pendingRef.current = false;
        window.setTimeout(() => load().catch(() => {}), 0);
      }
    }
  }, [clearSlot, updateSlot, userId]);

  useEffect(() => {
    surfaceRef.current = surface;
    load().catch(() => {});
  }, [load, surface]);

  useEffect(() => {
    if (!userId) {
      clearSlot("overlay");
      clearSlot("inline");
      return undefined;
    }
    let unsubscribe = () => {};
    let alive = true;
    let reloadTimer = null;
    subscribeToCampaignDeliveries(() => {
      window.clearTimeout(reloadTimer);
      reloadTimer = window.setTimeout(() => load().catch(() => {}), 250);
    }, { userId }).then((stop) => {
      if (alive) unsubscribe = stop;
      else stop();
    });
    return () => {
      alive = false;
      window.clearTimeout(reloadTimer);
      unsubscribe();
    };
  }, [clearSlot, load, userId]);

  useEffect(() => () => Object.values(timersRef.current).forEach((timer) => window.clearTimeout(timer)), []);

  const hideSlot = useCallback((name) => {
    const slot = slotsRef.current[name];
    if (!slot.row || slot.leaving) return;
    const settings = settingsFor(slot.row);
    const duration = settings.closingAnimation === "none" ? 0 : settings.animationDurationMs;
    updateSlot(name, { row: slot.row, leaving: true });
    window.clearTimeout(timersRef.current[name]);
    timersRef.current[name] = window.setTimeout(() => {
      updateSlot(name, EMPTY_SLOT);
      load().catch(() => {});
    }, duration);
  }, [load, updateSlot]);

  const overlaySettings = useMemo(() => settingsFor(slots.overlay.row), [slots.overlay.row]);
  const inlineSettings = useMemo(() => settingsFor(slots.inline.row), [slots.inline.row]);

  // Auto-dismiss closes the card without counting as a dismissal.
  useEffect(() => {
    const seconds = overlaySettings?.autoDismissSeconds || 0;
    if (!slots.overlay.row || slots.overlay.leaving || !seconds) return undefined;
    const timer = window.setTimeout(() => hideSlot("overlay"), seconds * 1000);
    return () => window.clearTimeout(timer);
  }, [hideSlot, overlaySettings, slots.overlay.leaving, slots.overlay.row]);

  function handleAction(name) {
    const row = slotsRef.current[name].row;
    if (!row) return;
    if (row.action_target) {
      if (!openUnifiedNotification(mapSurfacePlatformNotification(row))) return;
      recordCampaignClick(row, { cta: true }).catch(() => {});
    } else {
      // A critical alert without an action is acknowledged.
      recordCampaignClick(row).catch(() => {});
    }
    hideSlot(name);
  }

  function handleDismiss(name) {
    const row = slotsRef.current[name].row;
    if (!row || !settingsFor(row).canDismiss) return;
    recordCampaignDismissed(row).catch(() => {});
    hideSlot(name);
  }

  return (
    <>
      {[["overlay", overlaySettings], ["inline", inlineSettings]].map(([name, settings]) => {
        const slot = slots[name];
        if (!slot.row || !settings) return null;
        return (
          <AppPortal key={name}>
            <CampaignPresentation
              key={slot.row.id}
              content={campaignContentFromRow(slot.row)}
              settings={settings}
              leaving={slot.leaving}
              bottomOffset={!bottomTabsHidden}
              onAction={() => handleAction(name)}
              onDismiss={() => handleDismiss(name)}
            />
          </AppPortal>
        );
      })}
    </>
  );
}
