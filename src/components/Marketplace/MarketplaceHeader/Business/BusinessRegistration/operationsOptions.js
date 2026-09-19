// Choices on the registration Operations step, shared with KAI form filling.

export const BUSINESS_TYPES = [
  { id: "physical", labelKey: "typePhysical" },
  { id: "online", labelKey: "typeOnline" },
  { id: "both", labelKey: "typeBoth" },
];

export const VENDOR_TYPES = [
  ["wholesaler", "Wholesaler"],
  ["distributor", "Distributor"],
  ["manufacturer", "Manufacturer"],
  ["importer", "Importer"],
  ["general_supplier", "General supplier"],
];

export const SALES_MODELS = [
  ["wholesale", "Wholesale only"],
  ["wholesale_retail", "Wholesale and retail"],
  ["contract_supply", "Contract and institutional supply"],
];

export const SELLING_UNITS = ["item", "pack", "carton", "bag", "kilogram", "tonne", "litre", "pallet", "roll", "box"];
