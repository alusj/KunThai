export function shouldOpenAddressAccuracyCaution({
  address = "",
  previousAddress = "",
  dismissed = false,
} = {}) {
  const nextValue = String(address).trim();
  const previousValue = String(previousAddress).trim();

  return !dismissed && Boolean(nextValue) && nextValue !== previousValue;
}
