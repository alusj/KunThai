// Persistence for otp-delivery. Tables are service-role only (see migrations
// 20260926170000_otp_delivery_chain.sql and 20260928120000_otp_delivery_hardening.sql).

export type Channel = "whatsapp" | "orange_sms" | "twilio_verify";
export type Status = "sending" | "sent" | "delivered" | "exhausted" | "superseded" | "failed";

export interface Delivery {
  id: string;
  user_id: string | null;
  phone: string;
  calling_code: string;
  channels: Channel[];
  step: number;
  current_channel: Channel | null;
  status: Status;
  provider_message_id: string | null;
  code_ciphertext: string | null;
  code_hash: string | null;
  attempts: number;
  manual_fallback_used: boolean;
  history: unknown[];
  created_at: string;
  expires_at: string;
  delivered_at: string | null;
  precheck_passed_at: string | null;
}

export interface Store {
  getRoute(phone: string): Promise<{ calling_code: string; channels: Channel[] }>;
  isWhatsAppUnreachable(phone: string, nowIso: string): Promise<boolean>;
  markWhatsAppUnreachable(phone: string, reason: string, untilIso: string): Promise<void>;
  recentSendTimes(phone: string, sinceIso: string): Promise<string[]>;
  supersedeActive(phone: string): Promise<void>;
  insertDelivery(row: Delivery): Promise<void>;
  updateDelivery(id: string, patch: Partial<Delivery>): Promise<void>;
  findByMessageId(messageId: string): Promise<Delivery | null>;
  latestActive(phone: string, nowIso: string): Promise<Delivery | null>;
  // Atomically adds one attempt and returns the new total.
  registerAttempt(id: string): Promise<number>;
}

// deno-lint-ignore no-explicit-any
type SupabaseClient = any;

export function supabaseStore(db: SupabaseClient): Store {
  const must = <T>(r: { data: T; error: unknown }): T => {
    if (r.error) throw new Error(`db: ${(r.error as { message?: string }).message ?? "error"}`);
    return r.data;
  };
  return {
    async getRoute(phone) {
      const rows = must(
        await db.from("kunthai_otp_routes").select("calling_code, channels").eq("is_active", true),
      ) as { calling_code: string; channels: Channel[] }[];
      let best: { calling_code: string; channels: Channel[] } | null = null;
      for (const r of rows) {
        if (r.calling_code !== "*" && phone.startsWith(r.calling_code)) {
          if (!best || r.calling_code.length > best.calling_code.length) best = r;
        }
      }
      return best ?? rows.find((r) => r.calling_code === "*") ?? { calling_code: "*", channels: ["whatsapp", "twilio_verify"] };
    },
    async isWhatsAppUnreachable(phone, nowIso) {
      const rows = must(
        await db.from("kunthai_otp_whatsapp_unreachable").select("phone").eq("phone", phone).gt("until", nowIso).limit(1),
      ) as unknown[];
      return rows.length > 0;
    },
    async markWhatsAppUnreachable(phone, reason, untilIso) {
      must(
        await db.from("kunthai_otp_whatsapp_unreachable").upsert({
          phone,
          reason,
          until: untilIso,
          updated_at: new Date().toISOString(),
        }),
      );
    },
    async recentSendTimes(phone, sinceIso) {
      const rows = must(
        await db
          .from("kunthai_otp_deliveries")
          .select("created_at")
          .eq("phone", phone)
          .gte("created_at", sinceIso)
          .neq("status", "failed")
          .order("created_at", { ascending: false }),
      ) as { created_at: string }[];
      return rows.map((r) => r.created_at);
    },
    async supersedeActive(phone) {
      must(
        await db
          .from("kunthai_otp_deliveries")
          .update({ status: "superseded", code_ciphertext: null })
          .eq("phone", phone)
          .in("status", ["sending", "sent", "delivered"]),
      );
    },
    async insertDelivery(row) {
      must(await db.from("kunthai_otp_deliveries").insert(row));
    },
    async updateDelivery(id, patch) {
      must(await db.from("kunthai_otp_deliveries").update(patch).eq("id", id));
    },
    async findByMessageId(messageId) {
      const rows = must(
        await db.from("kunthai_otp_deliveries").select("*").eq("provider_message_id", messageId).limit(1),
      ) as Delivery[];
      return rows[0] ?? null;
    },
    async latestActive(phone, nowIso) {
      const rows = must(
        await db
          .from("kunthai_otp_deliveries")
          .select("*")
          .eq("phone", phone)
          .in("status", ["sending", "sent", "delivered", "exhausted"])
          .gt("expires_at", nowIso)
          .order("created_at", { ascending: false })
          .limit(1),
      ) as Delivery[];
      return rows[0] ?? null;
    },
    async registerAttempt(id) {
      const n = must(await db.rpc("kunthai_otp_register_attempt", { p_delivery_id: id })) as number;
      return Number(n);
    },
  };
}
