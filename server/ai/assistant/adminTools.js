// KAI — Admin assistant tools.
//
// Read-only views the admin app can already load for the signed-in
// administrator. They run in the browser through adminService (the admin RPCs
// and RLS), after the server has confirmed admin access. No tool here can
// claim, decide, restrict, grant, publish or undo anything.

import { cleanLine } from "../aiInput.js";
import { registerToolGroup } from "./assistantTools.js";

const ADMIN_ONLY = { surfaces: ["admin"], roles: ["admin"] };

registerToolGroup({
  get_platform_summary: {
    kind: "data",
    ...ADMIN_ONLY,
    description: "Get the admin dashboard summary: open, urgent, unassigned and overdue cases, cases resolved today, and open cases by sector and queue.",
    clean: () => ({}),
  },

  get_admin_cases: {
    kind: "data",
    ...ADMIN_ONLY,
    description:
      "Get admin cases the administrator can see, with counts by sector, queue, status, priority and overdue state, plus the most recent cases (titles and short descriptions, no personal contact details). Use for patterns, trends and support/report summaries.",
    parameters: {
      type: "object",
      properties: {
        status: { type: "string", enum: ["open", "resolved", "all"] },
        sector: { type: "string", enum: ["any", "explore", "marketplace", "transport"] },
        queue: { type: "string", description: "Optional queue, e.g. support, reports, verification, finance." },
      },
    },
    clean: (args) => ({
      status: ["open", "resolved", "all"].includes(args.status) ? args.status : "open",
      sector: ["explore", "marketplace", "transport"].includes(args.sector) ? args.sector : "",
      queue: cleanLine(args.queue, 40).toLowerCase().replace(/[^a-z_]/g, ""),
    }),
  },

  get_notification_campaigns: {
    kind: "data",
    ...ADMIN_ONLY,
    description: "Get recent notification campaigns: counts by status and the latest campaign names, titles and categories.",
    clean: () => ({}),
  },

  get_recent_admin_activity: {
    kind: "data",
    ...ADMIN_ONLY,
    description: "Get recent administrative actions from the audit log (action types and times, without administrator emails) to summarise platform activity.",
    clean: () => ({}),
  },
});
