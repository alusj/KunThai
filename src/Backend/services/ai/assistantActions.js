import { t } from "../../../i18n";
import { openSection } from "./aiEntityNavigation";
import { startTripBooking } from "./tripBookingFlow";
import { getRecentAssistantPlace } from "./assistantTools/urrideTools";
import { areaViewDestinationFromPlace } from "./urrideAiModels";

// KAI — prepared actions the person can confirm.
//
// The assistant can only offer these; each runs when the person presses its
// button, and each one hands off to an existing KunThai screen where any real
// commitment (booking, paying, publishing, sending) still needs its own
// confirmation. Nothing here writes data.

const HANDLERS = {
  open_section: {
    label: (action) => t("ai.chat.actions.openSection", { section: t(`ai.chat.sections.${action.section}`) }),
    run: (action) => openSection(action.section),
  },
  // The place is looked up from this session's KunThai place search again at
  // tap time, so the destination is always the real search result. It starts
  // KAI's guided booking in the chat (the chat stays open for the questions).
  open_area_view: {
    label: (action) => t("ai.chat.actions.planTrip", { place: action.name || "" }),
    keepOpen: true,
    run: (action) => {
      const place = getRecentAssistantPlace(action.placeId);
      if (place && areaViewDestinationFromPlace(place)) startTripBooking(place);
    },
  },
};

export function registerAssistantActions(handlers) {
  Object.assign(HANDLERS, handlers);
}

export function assistantActionLabel(action) {
  const handler = HANDLERS[action?.type];
  return handler ? handler.label(action) : "";
}

export function isKnownAssistantAction(action) {
  return Boolean(HANDLERS[action?.type]);
}

/** Runs only from a button press. */
export function runAssistantAction(action, { onDone } = {}) {
  const handler = HANDLERS[action?.type];
  if (!handler) return;
  handler.run(action);
  if (!handler.keepOpen) onDone?.();
}
