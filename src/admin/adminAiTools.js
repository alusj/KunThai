import { getAdminCases, getAuditLog, getDashboardSummary, getNotificationCampaigns } from "./adminService";
import { auditFacts, campaignsFacts, casesOverviewFacts, platformSummaryFacts } from "./adminAiModels";
import { registerAssistantTools } from "../Backend/services/ai/assistantTools";
import { registerAssistantProgressLabels } from "../Backend/services/ai/assistantPrompts";

// KAI — admin tool executors.
//
// Registered only when the admin workspace loads, so admin code never ships in
// the public app bundle. Each runs the admin app's own read functions (admin
// RPCs and RLS) after the server has verified the caller is an administrator.
// The helpers in adminAiModels strip personal details before anything reaches
// the model.

let registered = false;

export function registerAdminAiTools() {
  if (registered) return;
  registered = true;

  registerAssistantTools({
    get_platform_summary: async () => ({ result: platformSummaryFacts(await getDashboardSummary()) }),
    get_admin_cases: async (args) => {
      const cases = await getAdminCases({ limit: 300, ...(args.status === "all" ? {} : { status: args.status === "open" ? "open" : "" }) });
      return { result: casesOverviewFacts(cases, args) };
    },
    get_notification_campaigns: async () => ({ result: campaignsFacts(await getNotificationCampaigns()) }),
    get_recent_admin_activity: async () => ({ result: auditFacts(await getAuditLog()) }),
  });

  registerAssistantProgressLabels({
    get_platform_summary: "ai.admin.progress.summary",
    get_admin_cases: "ai.admin.progress.cases",
    get_notification_campaigns: "ai.admin.progress.campaigns",
    get_recent_admin_activity: "ai.admin.progress.activity",
  });
}
