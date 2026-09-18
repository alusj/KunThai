function isEnabled(value) {
  return ["1", "true", "yes", "on"].includes(String(value || "").trim().toLowerCase());
}

// Automated content moderation stays opt-in until KunThai is ready to launch it.
// The member expression must stay exactly `import.meta.env.VITE_…` so Vite
// substitutes the value at build time; the try only lets Node tests (where
// import.meta.env is undefined) load this file.
function readFlag() {
  try {
    return import.meta.env.VITE_CONTENT_MODERATION_ENABLED;
  } catch {
    return "";
  }
}

export const CONTENT_MODERATION_ENABLED = isEnabled(readFlag());

