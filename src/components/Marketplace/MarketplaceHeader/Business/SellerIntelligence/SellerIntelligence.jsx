import {
  BarChart3,
  Headphones,
  ShieldCheck,
  Star,
  Wallet,
} from "lucide-react";
import { useState } from "react";

import { useSellerCustomerCare } from "../../../../../Backend/hooks/useSellerCustomerCare";
import { useSellerInsights } from "../../../../../Backend/hooks/useSellerInsights";
import { useSellerPayouts } from "../../../../../Backend/hooks/useSellerPayouts";
import { useSellerReputation } from "../../../../../Backend/hooks/useSellerReputation";
import { formatCurrency } from "../../../../../Backend/utils/formatCurrency";
import { useI18n, t } from "../../../../../i18n";
import SellerIntelligenceMetric from "./SellerIntelligenceMetric";
import SellerIntelligencePanel from "./SellerIntelligencePanel";

function metricRows(metrics = {}) {
  return Object.entries(metrics).map(([key, metric]) => ({
    id: key,
    label: metric.label || key,
    value: metric.value ?? "0",
    detail: metric.detail || t("urmall.biz.intel.noExtraDetail"),
  }));
}

export default function SellerIntelligence() {
  useI18n();
  const insights = useSellerInsights();
  const payouts = useSellerPayouts();
  const care = useSellerCustomerCare();
  const reputation = useSellerReputation();
  const [activeKey, setActiveKey] = useState("reviews");

  const loading =
    insights.loading || payouts.loading || care.loading || reputation.loading;

  const items = (() => {
    const reputationMetrics = reputation.metrics || {};
    const careMetrics = care.metrics || {};
    const insightMetrics = insights.metrics || {};
    const productSignals = insights.productSignals || {};

    return [
      {
        key: "reviews",
        icon: Star,
        label: t("urmall.biz.intel.reviewsTab"),
        value: Number(reputationMetrics.rating || 0).toFixed(1),
        title: t("urmall.biz.intel.reviewsTitle"),
        description: t("urmall.biz.intel.reviewsDesc"),
        tone: "amber",
        rows: [
          {
            id: "review-count",
            label: t("urmall.biz.intel.totalReviews"),
            value: reputationMetrics.reviewCount || 0,
            detail: t("urmall.biz.intel.totalReviewsDetail"),
          },
          {
            id: "response-needed",
            label: t("urmall.biz.intel.needResponse"),
            value: reputation.reviewsNeedingResponse.length,
            detail: t("urmall.biz.intel.needResponseDetail"),
          },
          ...reputation.recentReviews.map((review) => ({
            id: review.id,
            label: review.buyerName || t("urmall.biz.intel.buyerReview"),
            value: t("urmall.biz.intel.ratingN", { n: review.rating || 0 }),
            detail: review.comment || review.productName || t("urmall.biz.intel.noReviewComment"),
          })),
        ],
      },
      {
        key: "insights",
        icon: BarChart3,
        label: t("urmall.biz.intel.insightsTab"),
        value: insightMetrics.productClicks?.value ?? 0,
        title: t("urmall.biz.intel.insightsTitle"),
        description: t("urmall.biz.intel.insightsDesc"),
        tone: "green",
        rows: [
          ...metricRows(insightMetrics),
          {
            id: "most-viewed",
            label: t("urmall.biz.ins.mostViewed"),
            value: productSignals.mostViewed?.views || 0,
            detail: productSignals.mostViewed?.name || t("urmall.biz.intel.noViewedProduct"),
          },
          {
            id: "most-abandoned",
            label: t("urmall.biz.ins.mostAbandoned"),
            value: productSignals.mostAbandoned?.orders || 0,
            detail: productSignals.mostAbandoned?.name || t("urmall.biz.intel.noProductSignal"),
          },
        ],
      },
      {
        key: "payouts",
        icon: Wallet,
        label: t("urmall.biz.intel.payoutsTab"),
        value: formatCurrency(payouts.availableBalance || 0),
        title: t("urmall.biz.intel.payoutsTitle"),
        description: t("urmall.biz.intel.payoutsDesc"),
        tone: "blue",
        rows: [
          {
            id: "available",
            label: t("urmall.biz.intel.availableBalance"),
            value: formatCurrency(payouts.availableBalance || 0),
            detail: t("urmall.biz.intel.availableBalanceDetail"),
          },
          {
            id: "pending",
            label: t("urmall.biz.intel.pendingBalance"),
            value: formatCurrency(payouts.pendingBalance || 0),
            detail: t("urmall.biz.intel.pendingBalanceDetail"),
          },
          {
            id: "method",
            label: t("urmall.biz.intel.withdrawalMethod"),
            value: payouts.withdrawalMethod ? t("urmall.biz.intel.added") : t("urmall.biz.intel.missing"),
            detail: payouts.withdrawalMethod?.label || t("urmall.biz.intel.addMethodDetail"),
          },
          {
            id: "warning",
            label: t("urmall.biz.intel.payoutWarning"),
            value: payouts.warning?.active ? t("urmall.biz.intel.action") : t("urmall.biz.intel.none"),
            detail: payouts.warning?.description || t("urmall.biz.intel.noPayoutWarning"),
          },
        ],
      },
      {
        key: "care",
        icon: Headphones,
        label: t("urmall.biz.intel.careTab"),
        value: careMetrics.unreadMessages || 0,
        title: t("urmall.biz.intel.careTitle"),
        description: t("urmall.biz.intel.careDesc"),
        tone: "purple",
        rows: [
          {
            id: "unread",
            label: t("urmall.biz.intel.unreadMessages"),
            value: careMetrics.unreadMessages || 0,
            detail: t("urmall.biz.intel.unreadMessagesDetail"),
          },
          {
            id: "response-time",
            label: t("urmall.biz.intel.avgResponseTime"),
            value: careMetrics.averageResponseTime || "0",
            detail: t("urmall.biz.intel.avgResponseTimeDetail"),
          },
          {
            id: "questions",
            label: t("urmall.biz.intel.buyerQuestions"),
            value: careMetrics.buyerQuestionsWaiting || 0,
            detail: t("urmall.biz.intel.buyerQuestionsDetail"),
          },
          {
            id: "support",
            label: t("urmall.biz.intel.supportDisputes"),
            value: careMetrics.supportDisputes || 0,
            detail: t("urmall.biz.intel.supportDisputesDetail"),
          },
          ...care.conversations.map((conversation) => ({
            id: conversation.id,
            label: conversation.buyerName || t("urmall.biz.stats.buyer"),
            value: conversation.unread ? t("urmall.biz.intel.unread") : t("urmall.biz.intel.read"),
            detail: conversation.preview || conversation.topic || t("urmall.biz.intel.noPreview"),
          })),
        ],
      },
      {
        key: "trust",
        icon: ShieldCheck,
        label: t("urmall.biz.intel.trustTab"),
        value: `${reputationMetrics.profileCompleteness || 0}%`,
        title: t("urmall.biz.intel.trustTitle"),
        description: t("urmall.biz.intel.trustDesc"),
        tone: "gray",
        rows: [
          {
            id: "profile",
            label: t("urmall.biz.intel.profileCompleteness"),
            value: `${reputationMetrics.profileCompleteness || 0}%`,
            detail: t("urmall.biz.intel.profileCompletenessDetail"),
          },
          {
            id: "complaints",
            label: t("urmall.biz.intel.complaintRate"),
            value: `${reputationMetrics.complaintRate || 0}%`,
            detail: t("urmall.biz.intel.complaintRateDetail"),
          },
          {
            id: "cancellations",
            label: t("urmall.biz.intel.cancellationRate"),
            value: `${reputationMetrics.cancellationRate || 0}%`,
            detail: t("urmall.biz.intel.cancellationRateDetail"),
          },
          {
            id: "delivery",
            label: t("urmall.biz.intel.onTimeDelivery"),
            value: `${reputationMetrics.onTimeDeliveryRate || 0}%`,
            detail: t("urmall.biz.intel.onTimeDeliveryDetail"),
          },
          ...reputation.badges.map((badge) => ({
            id: badge.id,
            label: badge.label,
            value: badge.status === "active" ? t("urmall.biz.intel.active") : t("urmall.biz.intel.locked"),
            detail: badge.status === "active" ? t("urmall.biz.intel.badgeActive") : t("urmall.biz.intel.badgeLocked"),
          })),
        ],
      },
    ];
  })();

  const activeItem = items.find((item) => item.key === activeKey) || items[0];

  if (loading) return null;

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="mb-4">
        <h3 className="text-base font-black text-gray-950">{t("urmall.biz.intel.title")}</h3>
        <p className="text-sm font-medium text-gray-500">
          {t("urmall.biz.intel.subtitle")}
        </p>
      </div>

      <div className="flex gap-3 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {items.map((item) => (
          <SellerIntelligenceMetric
            key={item.key}
            icon={item.icon}
            label={item.label}
            value={item.value}
            tone={item.tone}
            active={activeItem.key === item.key}
            onClick={() => setActiveKey(item.key)}
          />
        ))}
      </div>

      <div className="mt-4">
        <SellerIntelligencePanel item={activeItem} />
      </div>
    </section>
  );
}
