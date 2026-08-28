export function getMarketplacePromotionDurationDays(credits) {
  const amount = Math.max(0, Math.floor(Number(credits) || 5));
  // Fair, continuous pricing: 5 credits buys one day, then each additional
  // credit adds 0.3 day. This makes 10 credits 2.5 days (not the old six),
  // 15 credits four days, and 20 credits 5.5 days, capped at 30 days.
  const days = Math.max(1, Math.min(30, 1 + Math.max(0, amount - 5) * 0.3));
  return Number(days.toFixed(1));
}

export function getMinimumExploreAdvertCredits(placement = "urfeed") {
  if (placement === "both") return 15;
  if (placement === "swip") return 10;
  return 5;
}

export function getMonimePaymentInstructions({ credits = 0, phoneNumber = "", walletName = "Mobile money" } = {}) {
  const creditLabel = Number(credits) > 0 ? ` for ${Number(credits)} Visibility Credits` : "";
  return {
    title: `Complete with ${walletName}`,
    message: phoneNumber
      ? `This payment code is secured to ${phoneNumber}. Tap Dial below, then enter your ${walletName} PIN to confirm${creditLabel}.`
      : `Tap Dial below, then enter your ${walletName} PIN to confirm${creditLabel}.`,
  };
}
