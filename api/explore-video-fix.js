// /api/explore-video-fix — makes a Swip video a faststart MP4 on the server.
// POST from the app right after a video post; GET from the daily Vercel cron.
// See server/explore/videoFaststart.js and server/explore/videoFixHandler.js.

import { createClient } from "@supabase/supabase-js";

import { handleCors } from "../server/cors.js";
import { ensurePostVideoFaststart } from "../server/explore/videoFaststart.js";
import { createVideoFixHandler } from "../server/explore/videoFixHandler.js";

const supabaseUrl = () => process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "";
const clientOptions = { auth: { persistSession: false, autoRefreshToken: false } };

const handleVideoFix = createVideoFixHandler({
  createAdmin() {
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
    return supabaseUrl() && key ? createClient(supabaseUrl(), key, clientOptions) : null;
  },
  async authenticate(token) {
    const key = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || "";
    if (!supabaseUrl() || !key) return null;
    const { data, error } = await createClient(supabaseUrl(), key, clientOptions).auth.getUser(token);
    return error ? null : data?.user || null;
  },
  ensure(post) {
    const admin = createClient(supabaseUrl(), process.env.SUPABASE_SERVICE_ROLE_KEY || "", clientOptions);
    return ensurePostVideoFaststart({ post, supabaseUrl: supabaseUrl(), admin });
  },
});

export default async function handler(req, res) {
  if (handleCors(req, res)) return undefined;
  return handleVideoFix(req, res);
}
