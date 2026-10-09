// Pure rules for Security > Change password (no imports, node-testable).

export const MIN_PASSWORD_LENGTH = 8;

// Returns an error code for the change-password form, or "".
export function validateNewPassword({ password = "", confirm = "", code = "", needsCode = false } = {}) {
  if (String(password).length < MIN_PASSWORD_LENGTH) return "too_short";
  if (password !== confirm) return "mismatch";
  if (needsCode && !/^\d{6,10}$/.test(String(code).trim())) return "code_required";
  return "";
}

// Where Supabase sends the confirmation code for this account, or "" when it
// has neither a confirmed email nor phone (the password is then set directly).
export function reauthenticationChannel(user) {
  if (user?.email && user?.email_confirmed_at) return "email";
  if (user?.phone && user?.phone_confirmed_at) return "phone";
  return "";
}
