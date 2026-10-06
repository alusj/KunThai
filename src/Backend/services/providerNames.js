// Names supplied by a social sign-in (Apple, Google, Facebook), used only to
// pre-fill the editable name fields in onboarding. The person's own saved
// names (first_name / last_name) always win and are never overwritten.

export const NAME_PREFILL_PROVIDERS = ["apple", "google", "facebook"];

function clean(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

// Google and Facebook send `full_name` / `name`, sometimes `given_name` /
// `family_name`. Apple (via Supabase web sign-in, or our native sheet) sends
// the same keys, but only on the very first authorization.
export function providerNameParts(input = {}) {
  const metadata = input || {};
  const given = clean(metadata.given_name);
  const family = clean(metadata.family_name);
  if (given || family) return { firstName: given, lastName: family };

  const full = clean(metadata.full_name || metadata.name);
  // An email-like value is not a name (some providers fall back to it).
  if (!full || full.includes("@")) return { firstName: "", lastName: "" };
  const [firstName, ...rest] = full.split(" ");
  return { firstName, lastName: rest.join(" ") };
}

// The metadata patch to store a name Apple shared on the native sheet.
// Returns null when nothing should be written: Apple gave no name, or the
// account already has a provider name or a name the person saved.
export function appleNameMetadataPatch(existingMetadata = {}, { givenName = "", familyName = "" } = {}) {
  const given = clean(givenName);
  const family = clean(familyName);
  if (!given && !family) return null;

  const meta = existingMetadata || {};
  const hasName = [meta.first_name, meta.last_name, meta.given_name, meta.family_name, meta.full_name, meta.name]
    .some((value) => clean(value));
  if (hasName) return null;

  return {
    given_name: given,
    family_name: family,
    full_name: [given, family].filter(Boolean).join(" "),
  };
}
