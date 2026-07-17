import supabase from "../lib/supabaseClient";

const INVITE_STORAGE_KEY = "kunthai.visibilityInviteCode";
const CREDIT_SHARE_PARAM = "kt_ref";

export const VERIFIED_INVITE_CREDIT_REWARD = 5;
export const MINIMUM_VISIBILITY_CREDITS = 5;

export const VISIBILITY_BOOST_PACKAGES = [
  {
    id: "small",
    label: "Small Boost",
    credits: 5,
    helper: "Good for a starter advert or product push.",
  },
  {
    id: "medium",
    label: "Medium Boost",
    credits: 10,
    helper: "More delivery strength for the same campaign.",
  },
  {
    id: "strong",
    label: "Strong Boost",
    credits: 20,
    helper: "Best for important offers and launches.",
  },
  {
    id: "custom",
    label: "Custom",
    credits: 5,
    helper: "Choose how many credits to spend now.",
  },
];

const DEFAULT_WALLET = {
  balance: 0,
  lifetimeEarned: 0,
  lifetimeSpent: 0,
  inviteCode: "",
  inviteUrl: "",
  rewardPerVerifiedInvite: VERIFIED_INVITE_CREDIT_REWARD,
};

function isUnavailableVisibilityFeature(error) {
  const message = String(error?.message || error?.details || error?.hint || "").toLowerCase();
  return (
    error?.code === "PGRST202" ||
    error?.code === "42P01" ||
    message.includes("could not find the function") ||
    message.includes("could not find the table") ||
    message.includes("does not exist")
  );
}

function normalizeWallet(row = {}, invite = {}) {
  const inviteCode = invite.code || "";
  return {
    balance: Number(row.balance || 0),
    lifetimeEarned: Number(row.lifetime_earned || row.lifetimeEarned || 0),
    lifetimeSpent: Number(row.lifetime_spent || row.lifetimeSpent || 0),
    inviteCode,
    inviteUrl: buildVisibilityInviteUrl(inviteCode),
    rewardPerVerifiedInvite: Number(invite.reward_credits || VERIFIED_INVITE_CREDIT_REWARD),
  };
}

function readInviteCodeFromUrl() {
  if (typeof window === "undefined") return "";

  try {
    const url = new URL(window.location.href);
    const queryCode = url.searchParams.get(CREDIT_SHARE_PARAM) || url.searchParams.get("invite") || "";
    if (queryCode) return queryCode;

    const hash = String(url.hash || "");
    const hashMatch = hash.match(/(?:kt_ref|invite|visibility-invite)[=/:-]([a-z0-9-]+)/i);
    return hashMatch?.[1] || "";
  } catch {
    return "";
  }
}

function normalizeInviteCode(code = "") {
  return String(code || "").trim().replace(/[^a-z0-9-]/gi, "").slice(0, 48);
}

export function normalizeVisibilityCreditSpend(value, fallback = MINIMUM_VISIBILITY_CREDITS) {
  const amount = Math.floor(Number(value || fallback));
  return Number.isFinite(amount) ? Math.max(0, amount) : fallback;
}

export function getVisibilityPackageByCredits(credits) {
  const amount = normalizeVisibilityCreditSpend(credits);
  return VISIBILITY_BOOST_PACKAGES.find((item) => item.id !== "custom" && item.credits === amount) || VISIBILITY_BOOST_PACKAGES[0];
}

export function buildVisibilityInviteUrl(code = "") {
  if (!code || typeof window === "undefined") return "";
  const url = new URL(window.location.origin);
  url.searchParams.set(CREDIT_SHARE_PARAM, code);
  return url.toString();
}

export function buildVisibilityShareMessage(inviteUrl = "") {
  return [
    "Join me on KunThai.",
    `Each verified invite helps me earn ${VERIFIED_INVITE_CREDIT_REWARD} Visibility Credits for adverts and UrMall boosts.`,
    inviteUrl,
  ].filter(Boolean).join("\n");
}

export function captureVisibilityInviteFromLocation() {
  const code = normalizeInviteCode(readInviteCodeFromUrl());
  if (!code || typeof localStorage === "undefined") return "";

  try {
    localStorage.setItem(INVITE_STORAGE_KEY, code);
  } catch {
    // Referral capture is helpful, but app navigation must not depend on storage.
  }

  return code;
}

export async function finalizeStoredVisibilityInvite() {
  if (typeof localStorage === "undefined") return null;

  const code = normalizeInviteCode(localStorage.getItem(INVITE_STORAGE_KEY) || readInviteCodeFromUrl());
  if (!code) return null;

  const { data, error } = await supabase.rpc("finalize_visibility_invite", {
    p_code: code,
  });

  if (error) {
    if (isUnavailableVisibilityFeature(error)) return null;
    throw new Error(error.message || "Unable to apply invite credit.");
  }

  const status = data?.status || "";
  if (["credited", "already_credited", "self_invite", "ineligible", "invalid"].includes(status)) {
    localStorage.removeItem(INVITE_STORAGE_KEY);
  }

  return data || null;
}

export async function fetchVisibilityCreditWallet() {
  const [{ data: wallet, error: walletError }, { data: invite, error: inviteError }] = await Promise.all([
    supabase.rpc("ensure_visibility_credit_wallet"),
    supabase.rpc("create_visibility_invite_link"),
  ]);

  if (walletError || inviteError) {
    const error = walletError || inviteError;
    if (isUnavailableVisibilityFeature(error)) return DEFAULT_WALLET;
    throw new Error(error.message || "Unable to load Visibility Credits.");
  }

  return normalizeWallet(Array.isArray(wallet) ? wallet[0] : wallet, Array.isArray(invite) ? invite[0] : invite);
}

export async function assertVisibilityCreditsAvailable(amount) {
  const requiredCredits = normalizeVisibilityCreditSpend(amount);
  if (requiredCredits < MINIMUM_VISIBILITY_CREDITS) {
    throw new Error(`Choose at least ${MINIMUM_VISIBILITY_CREDITS} Visibility Credits for a boost.`);
  }

  const wallet = await fetchVisibilityCreditWallet();
  if (wallet.balance < requiredCredits) {
    throw new Error(`You have ${wallet.balance} Visibility Credits. Earn more credits or choose a smaller boost.`);
  }

  return wallet;
}

export async function shareVisibilityInviteLink() {
  const wallet = await fetchVisibilityCreditWallet();
  if (!wallet.inviteUrl) throw new Error("Unable to create your invite link.");

  const shareData = {
    title: "Join KunThai",
    text: buildVisibilityShareMessage(wallet.inviteUrl),
    url: wallet.inviteUrl,
  };

  if (typeof navigator !== "undefined" && navigator.share) {
    await navigator.share(shareData);
  } else if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(wallet.inviteUrl);
  } else if (typeof window !== "undefined") {
    window.prompt("Copy your KunThai invite link", wallet.inviteUrl);
  }

  return wallet;
}
