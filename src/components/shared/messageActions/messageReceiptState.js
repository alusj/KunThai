// Where one of my messages has got to: Sending → Sent → Delivered → Seen.
// seenAllowed is false when read receipts are off (then Delivered is the most
// it says).
export function messageReceiptState({ pending = false, deliveredAt = "", seen = false, seenAllowed = true } = {}) {
  if (pending) return "sending";
  if (seen && seenAllowed) return "seen";
  if (deliveredAt || seen) return "delivered";
  return "sent";
}
