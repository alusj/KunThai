// Pure passcode rules, shared by the lock screens and their tests.

// Mirrors the database's minimum rules, so mistakes are shown before sending.
export function passcodeProblem(passcode, confirmation = null) {
  const value = String(passcode || "");
  if (value.length < 6) return "Use at least 6 characters.";
  if (value.length > 64) return "Use 64 characters or fewer.";
  if (/^(.)\1+$/.test(value) || ["123456", "1234567", "12345678", "123456789", "654321", "012345", "111111", "password", "qwerty", "kunthai", "admin123"].includes(value.toLowerCase())) {
    return "That passcode is too easy to guess.";
  }
  if (confirmation !== null && confirmation !== value) return "The two passcodes do not match.";
  return "";
}

// 0-4 rough strength score for the setup meter.
export function passcodeStrength(passcode) {
  const value = String(passcode || "");
  if (!value) return 0;
  let score = 0;
  if (value.length >= 6) score += 1;
  if (value.length >= 10) score += 1;
  if (/[a-z]/i.test(value) && /\d/.test(value)) score += 1;
  if (/[^a-z0-9]/i.test(value) || (/[a-z]/.test(value) && /[A-Z]/.test(value))) score += 1;
  return passcodeProblem(value) ? Math.min(score, 1) : score;
}
