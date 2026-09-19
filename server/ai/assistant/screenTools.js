// KAI — tools that act on the screen the person has open.
//
// A screen declares what it offers (a fillable form, a message thread) and the
// browser sends those capabilities with each message. These tools are only
// declared to the model — and only accepted from it — when the current screen
// offers the matching capability. Both only PREPARE: the person sees the values
// or the reply and presses a button before anything is filled in or sent.

import { cleanText } from "../aiInput.js";
import { ToolArgumentError, registerToolGroup } from "./assistantTools.js";

export const SCREEN_CAPABILITIES = ["form", "message"];
const MAX_FORM_FIELDS = 40;
const MAX_REPLIES = 3;

function cleanFieldKey(value) {
  const key = String(value ?? "").trim();
  return /^[a-zA-Z][a-zA-Z0-9_.-]{0,79}$/.test(key) ? key : "";
}

registerToolGroup({
  fill_form_fields: {
    kind: "action",
    surfaces: ["*"],
    capability: "form",
    description:
      "Prepare values for fields of the form on the current screen. Use when the person asks you to fill in, complete or help with the form. " +
      "Only use field keys listed in the screen data, never image or file fields, and only values the person gave you or that follow directly from what they said. " +
      "The person reviews the values and presses a button to fill the form.",
    parameters: {
      type: "object",
      properties: {
        fields: {
          type: "array",
          description: "The fields to fill.",
          items: {
            type: "object",
            properties: {
              key: { type: "string", description: "Field key exactly as listed in the screen data." },
              value: { type: "string", description: "Value to put in the field. For yes/no fields use \"yes\" or \"no\"; for choices use one of the listed options; for several choices separate them with commas." },
            },
            required: ["key", "value"],
          },
        },
      },
      required: ["fields"],
    },
    clean: (args) => {
      const seen = new Set();
      const fields = (Array.isArray(args.fields) ? args.fields : [])
        .map((field) => ({ key: cleanFieldKey(field?.key), value: cleanText(field?.value, 600) }))
        .filter((field) => field.key && field.value !== "" && !seen.has(field.key) && seen.add(field.key))
        .slice(0, MAX_FORM_FIELDS);
      if (!fields.length) throw new ToolArgumentError("fields must list at least one field key and value from the screen data");
      return { fields };
    },
  },

  suggest_message_replies: {
    kind: "action",
    surfaces: ["*"],
    capability: "message",
    description:
      "Suggest replies for the conversation on the current screen. Use when the person asks you to reply, answer, respond or write a message. " +
      "Give 1 to 3 short, polite replies in the person's voice, based only on the conversation shown. The person chooses one and presses Send.",
    parameters: {
      type: "object",
      properties: {
        replies: { type: "array", items: { type: "string" }, description: "1 to 3 reply options, each ready to send as written." },
      },
      required: ["replies"],
    },
    clean: (args) => {
      const replies = Array.from(new Set((Array.isArray(args.replies) ? args.replies : [])
        .map((reply) => cleanText(reply, 800).trim())
        .filter(Boolean)))
        .slice(0, MAX_REPLIES);
      if (!replies.length) throw new ToolArgumentError("replies must contain at least one reply");
      return { replies };
    },
  },
});
