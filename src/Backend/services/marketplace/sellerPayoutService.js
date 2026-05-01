import { readRegisteredBusiness } from "./sellerRegistrationService";

function buildWithdrawalMethod(trustPayout) {
  if (trustPayout.skipped) {
    return null;
  }

  if (trustPayout.connectKunThaiMoney) {
    return {
      type: "KunThai Money",
      label: "Connected KunThai Money wallet",
      maskedAccount: "Primary payout option",
    };
  }

  if (trustPayout.bankName) {
    return {
      type: "Bank account",
      label: trustPayout.bankName,
      maskedAccount: trustPayout.accountNumber
        ? `**** ${trustPayout.accountNumber.slice(-4)}`
        : "Account number pending",
    };
  }

  return null;
}

export async function fetchSellerPayouts() {
  const registeredBusiness = await readRegisteredBusiness();
  const trustPayout = registeredBusiness?.trustPayout;
  const withdrawalMethod = trustPayout ? buildWithdrawalMethod(trustPayout) : null;

  return {
    availableBalance: 0,
    pendingBalance: 0,
    lastPayout: null,
    nextPayout: null,
    withdrawalMethod,
    warning: {
      active: !withdrawalMethod,
      title: "Payout setup incomplete",
      description: "Add KunThai Money or a bank account when you are ready to receive seller payouts.",
    },
    recentTransactions: [],
  };
}
