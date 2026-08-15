import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error("Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY.");
}

const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    detectSessionInUrl: true,
    persistSession: true,
    // PKCE is required so OAuth returns an authorization `code` we can exchange
    // for a session on native (Capacitor) via the custom-scheme deep link.
    // On the web, `detectSessionInUrl` still exchanges the code automatically,
    // so the existing browser flow is preserved.
    flowType: "pkce",
  },
});

export default supabase;
