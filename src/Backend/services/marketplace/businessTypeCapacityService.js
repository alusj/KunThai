import supabase from "../../lib/supabaseClient";
import { businessTypeCapacity, canonicalBusinessType, CURRENT_BUSINESS_TYPES, highestOwnedBusinessPlan } from "./businessTypePolicy";

export async function fetchBusinessTypeCapacity() {
  const { data, error } = await supabase.rpc("get_my_urmall_business_type_capacity");
  if (!error) return businessTypeCapacity({
    planCode: data?.plan_code,
    usedKinds: data?.used_kinds || [],
    upgradeBusinessId: data?.upgrade_business_id || "",
  });

  if (!["PGRST202", "42883"].includes(error.code)) throw error;
  // Compatibility while the new database guard is being installed. Count only
  // owned businesses; delegated admin workspaces never spend the owner's quota.
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth?.user) throw new Error("Sign in to manage business types.");
  const { data: businesses, error: businessesError } = await supabase.from("marketplace_businesses")
    .select("id,business_kind,created_at").eq("user_id", auth.user.id).order("created_at");
  if (businessesError) throw businessesError;
  if (!businesses?.length) return businessTypeCapacity();
  const { data: subscriptions, error: subscriptionsError } = await supabase.from("kunthai_business_subscriptions")
    .select("marketplace_business_id,plan_code,status,current_period_end")
    .eq("surface", "urmall").in("marketplace_business_id", businesses.map((business) => business.id));
  if (subscriptionsError) throw subscriptionsError;
  const highest = highestOwnedBusinessPlan(businesses, subscriptions || []);
  return businessTypeCapacity({
    planCode: highest?.plan_code || "free",
    usedKinds: businesses.map((business) => business.business_kind),
    upgradeBusinessId: highest?.marketplace_business_id || businesses[0].id,
  });
}

export async function assertCanCreateBusinessType(kind) {
  const normalized = canonicalBusinessType(kind);
  if (!CURRENT_BUSINESS_TYPES.includes(normalized)) throw new Error("Choose a supported business type.");
  const capacity = await fetchBusinessTypeCapacity();
  if (capacity.usedKinds.includes(normalized)) throw new Error("You already have this business type. Open its workspace to add locations or inventory.");
  if (!capacity.allowed) {
    const name = capacity.requiredPlan === "premium" ? "Premium" : "Pro";
    const error = new Error(`Your ${capacity.planCode} plan allows ${capacity.limit} business type${capacity.limit === 1 ? "" : "s"}. Upgrade an owned business to ${name} to add another type.`);
    error.code = "URMALL_BUSINESS_TYPE_LIMIT";
    throw error;
  }
  return capacity;
}
