import { getActiveAiScreen, prepareFormValues } from "../aiScreenContext";

// KAI — executors for the tools that act on the open screen.
//
// Both only PREPARE. The chat shows a card; the form is filled, or the reply
// sent, only when the person presses the card's button.

export const SCREEN_TOOLS = {
  fill_form_fields: async (args) => {
    const screen = getActiveAiScreen();
    if (!screen?.form?.apply) {
      return { result: { error: "There is no form on the current screen." } };
    }
    const { screenId, ready, skipped } = prepareFormValues(args.fields, screen);
    return {
      result: {
        prepared: ready.length,
        fields: ready.map((item) => ({ key: item.key, value: item.display })),
        skipped: skipped.map((item) => ({ key: item.key, reason: item.reason })),
        note: ready.length
          ? "The person will see these values and a button to fill the form. Nothing is filled until they press it."
          : "None of the values could be used. Explain why and ask the person for what is missing.",
      },
      actions: ready.length
        ? [{ type: "fill_form", screenId, screenTitle: screen.title || "", fields: ready, skipped }]
        : [],
    };
  },

  suggest_message_replies: async (args) => {
    const screen = getActiveAiScreen();
    if (!screen?.messaging?.send) {
      return { result: { error: "There is no conversation on the current screen." } };
    }
    const replies = (Array.isArray(args.replies) ? args.replies : []).filter(Boolean).slice(0, 3);
    return {
      result: {
        prepared: replies.length,
        note: "The person will see these replies, each with a Send button. Nothing is sent until they press it.",
      },
      actions: replies.map((text) => ({ type: "send_message", screenId: screen.id, text })),
    };
  },
};
