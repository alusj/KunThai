// Moves UrMall seller documents uploaded before 2026-10-07 out of the public
// media bucket into the private documents bucket, and points their rows at
// the new path (admins open them with signed links). Idempotent: rows already
// moved are skipped. Runs with the daily business-subscriptions job, and can
// be called on its own: GET /api/cron/secure-seller-documents with the
// CRON_SECRET bearer token.
import { createClient } from "@supabase/supabase-js";

export const PUBLIC_MEDIA_BUCKET = "marketplace-business-media";
export const PRIVATE_DOCUMENTS_BUCKET = "marketplace-business-documents";
const PUBLIC_MARKER = `/object/public/${PUBLIC_MEDIA_BUCKET}/`;

export function publicMediaPath(url) {
  const text = String(url || "");
  const index = text.indexOf(PUBLIC_MARKER);
  if (index < 0) return "";
  try {
    return decodeURIComponent(text.slice(index + PUBLIC_MARKER.length).split("?")[0]);
  } catch {
    return "";
  }
}

export async function secureSellerDocuments(adminClient, { batchSize = 100, maxBatches = 10 } = {}) {
  const result = { moved: 0, failed: 0 };
  const failedIds = new Set();

  for (let batch = 0; batch < maxBatches; batch += 1) {
    const { data: rows, error } = await adminClient
      .from("marketplace_business_documents")
      .select("id, file_url, storage_path")
      .eq("storage_path", "")
      .like("file_url", `%${PUBLIC_MARKER}%`)
      .limit(batchSize + failedIds.size);
    if (error) throw error;
    const pending = (rows || []).filter((row) => !failedIds.has(row.id));
    if (!pending.length) break;

    for (const row of pending) {
      const path = publicMediaPath(row.file_url);
      if (!path) {
        failedIds.add(row.id);
        result.failed += 1;
        continue;
      }
      const { error: moveError } = await adminClient.storage
        .from(PUBLIC_MEDIA_BUCKET)
        .move(path, path, { destinationBucket: PRIVATE_DOCUMENTS_BUCKET });
      // Already moved by an earlier run whose row update failed: just repoint.
      const alreadyMoved = moveError && /not.?found/i.test(String(moveError.message || ""));
      if (moveError && !alreadyMoved) {
        failedIds.add(row.id);
        result.failed += 1;
        continue;
      }
      const { error: updateError } = await adminClient
        .from("marketplace_business_documents")
        .update({ storage_bucket: PRIVATE_DOCUMENTS_BUCKET, storage_path: path, file_url: "" })
        .eq("id", row.id);
      if (updateError) {
        failedIds.add(row.id);
        result.failed += 1;
      } else {
        result.moved += 1;
      }
    }
  }
  return result;
}

export default async function handler(req, res) {
  if (req.method !== "GET" && req.method !== "POST") {
    return res.status(405).json({ ok: false, message: "Method not allowed." });
  }
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || String(req.headers.authorization || "") !== `Bearer ${cronSecret}`) {
    return res.status(401).json({ ok: false, message: "Unauthorized." });
  }
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    return res.status(503).json({ ok: false, message: "Document storage is not configured." });
  }
  const adminClient = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
  try {
    return res.status(200).json({ ok: true, ...(await secureSellerDocuments(adminClient)) });
  } catch (error) {
    return res.status(500).json({ ok: false, message: error?.message || "Moving documents failed." });
  }
}
