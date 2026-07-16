// Orders store their delivery details as a single "|"-separated text blob in
// marketplace_orders.delivery_location. Two writer formats exist:
//   Direct order:  Fulfillment: delivery | taxi address | Address: ... | Contact: name | 077... | Note: ...
//   Cart checkout: Fulfillment: delivery | taxi address: ... | Phone: 077... | Note: ... | Payment preference: ...
// This parser turns either format (or a plain free-text address) into
// structured fields so order screens can show a clear address view.

const ADDRESS_LABEL_PATTERN = /^(.+?)\saddress(?::\s*(.*))?$/i;

export function parseOrderDeliveryDetails(deliveryLocation = "") {
  const details = {
    fulfillment: "",
    addressLabel: "",
    address: "",
    contact: "",
    phone: "",
    note: "",
    paymentPreference: "",
    raw: String(deliveryLocation || "").trim(),
  };

  if (!details.raw) return details;

  const segments = details.raw.split(" | ").map((segment) => segment.trim()).filter(Boolean);
  let currentKey = "";

  for (const segment of segments) {
    const lower = segment.toLowerCase();

    if (lower.startsWith("fulfillment:")) {
      details.fulfillment = segment.slice("fulfillment:".length).trim();
      currentKey = "";
      continue;
    }
    if (lower.startsWith("address:")) {
      details.address = segment.slice("address:".length).trim();
      currentKey = "address";
      continue;
    }
    if (lower.startsWith("contact:")) {
      details.contact = segment.slice("contact:".length).trim();
      currentKey = "contact";
      continue;
    }
    if (lower.startsWith("phone:")) {
      details.phone = segment.slice("phone:".length).trim();
      currentKey = "";
      continue;
    }
    if (lower.startsWith("note:")) {
      details.note = segment.slice("note:".length).trim();
      currentKey = "note";
      continue;
    }
    if (lower.startsWith("payment preference:")) {
      details.paymentPreference = segment.slice("payment preference:".length).trim();
      currentKey = "";
      continue;
    }

    const addressLabelMatch = segment.match(ADDRESS_LABEL_PATTERN);
    if (addressLabelMatch) {
      details.addressLabel = addressLabelMatch[1].trim();
      if (addressLabelMatch[2]) details.address = addressLabelMatch[2].trim();
      currentKey = "address";
      continue;
    }

    // Unlabelled segment: the direct-order format writes "Contact: name | phone",
    // so a bare segment right after Contact is the phone number.
    if (currentKey === "contact" && !details.phone) {
      details.phone = segment;
      continue;
    }
    if (currentKey === "note") {
      details.note = [details.note, segment].filter(Boolean).join(" | ");
      continue;
    }
    if (currentKey === "address" && !details.address) {
      details.address = segment;
      continue;
    }

    // Legacy plain-text delivery locations become the address itself.
    if (!details.address) details.address = segment;
    else details.note = [details.note, segment].filter(Boolean).join(" | ");
  }

  return details;
}

export function formatOrderFulfillment(details) {
  const fulfillment = String(details?.fulfillment || "").toLowerCase();
  if (fulfillment === "pickup") return "Pickup";
  if (fulfillment === "delivery") return "Delivery";
  return details?.fulfillment || "";
}
