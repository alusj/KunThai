// Whether a request saves or changes something the person asked for (an
// "action"), for buttonFeedback.js. No imports, so tests can load it.

// RPCs that change something the person asked for. Anything else (lookups,
// counters, tracking, location pings) is not an action.
const ACTION_RPC = /(^|_)(create|update|save|submit|accept|reject|decline|assign|unassign|remove|delete|cancel|approve|invite|add|set|send|post|publish|book|pay|purchase|redeem|confirm|complete|leave|join|transfer|grant|revoke|block|unblock|follow|unfollow|report|claim|archive|restore|withdraw|register|upgrade|downgrade|manage|share|start|stop|end|finish|rate|review|reply|edit|change|switch|move|release|suspend|reactivate|verify|reorder|promote)(_|$)/;
// Writes the app makes on its own, whichever button was pressed last.
const BACKGROUND_RPC = /^(record_|increment_|track_|log_|touch_|admin_touch_)|_native_|_ping$|live_location_share_update|mark_.*read|_heartbeat|_presence/;
const BACKGROUND_TABLE = /(signal|views?$|seen|impression|presence|^push_|device|token|session|metric|events?$|reads?$|history|logs?$|_stats?$|operator_locations|nearby_area_locations)/;

export function isActionRequest(input, init) {
  try {
    const method = String(init?.method || (typeof input === "object" && input?.method) || "GET").toUpperCase();
    if (method === "GET" || method === "HEAD" || method === "OPTIONS") return false;
    const url = new URL(typeof input === "string" ? input : input?.url || String(input || ""), "https://kunthai.app");
    const path = url.pathname;
    const rpc = path.match(/\/rest\/v1\/rpc\/([a-z0-9_]+)/i);
    if (rpc) {
      const name = rpc[1].toLowerCase();
      return ACTION_RPC.test(name) && !BACKGROUND_RPC.test(name);
    }
    const table = path.match(/\/rest\/v1\/([a-z0-9_]+)/i);
    if (table) return !BACKGROUND_TABLE.test(table[1].toLowerCase());
    // Photos, videos and documents being uploaded.
    return /\/storage\/v1\/(object|upload)\//.test(path);
  } catch {
    return false;
  }
}
