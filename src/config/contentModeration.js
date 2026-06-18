function isEnabled(value) {
  return ["1", "true", "yes", "on"].includes(String(value || "").trim().toLowerCase());
}

// Automated content moderation stays opt-in until KunThai is ready to launch it.
export const CONTENT_MODERATION_ENABLED = isEnabled(import.meta.env.VITE_CONTENT_MODERATION_ENABLED);

