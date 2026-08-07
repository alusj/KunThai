export async function submitPublicPrivacyRequest(input) {
  const response = await fetch("/api/privacy-request", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });

  const payload = await response.json().catch(() => null);

  if (!response.ok || !payload?.ok) {
    const error = new Error(payload?.message || "KunThai could not submit your request right now.");
    error.status = response.status;
    throw error;
  }

  return payload;
}
