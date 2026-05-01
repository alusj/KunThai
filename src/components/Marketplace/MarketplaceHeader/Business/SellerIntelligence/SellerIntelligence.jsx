import {
  BarChart3,
  Headphones,
  ShieldCheck,
  Star,
  Wallet,
} from "lucide-react";
import { useMemo, useState } from "react";

import { useSellerCustomerCare } from "../../../../../Backend/hooks/useSellerCustomerCare";
import { useSellerInsights } from "../../../../../Backend/hooks/useSellerInsights";
import { useSellerPayouts } from "../../../../../Backend/hooks/useSellerPayouts";
import { useSellerReputation } from "../../../../../Backend/hooks/useSellerReputation";
import { formatCurrency } from "../../../../../Backend/utils/formatCurrency";
import SellerIntelligenceMetric from "./SellerIntelligenceMetric";
import SellerIntelligencePanel from "./SellerIntelligencePanel";

function metricRows(metrics = {}) {
  return Object.entries(metrics).map(([key, metric]) => ({
    id: key,
    label: metric.label || key,
    value: metric.value ?? "0",
    detail: metric.detail || "No extra detail yet",
  }));
}

export default function SellerIntelligence() {
  const insights = useSellerInsights();
  const payouts = useSellerPayouts();
  const care = useSellerCustomerCare();
  const reputation = useSellerReputation();
  const [activeKey, setActiveKey] = useState("reviews");

  const loading =
    insights.loading || payouts.loading || care.loading || reputation.loading;

  const items = useMemo(() => {
    const reputationMetrics = reputation.metrics || {};
    const careMetrics = care.metrics || {};
    const insightMetrics = insights.metrics || {};
    const productSignals = insights.productSignals || {};

    return [
      {
        key: "reviews",
        icon: Star,
        label: "Reviews & Rating",
        value: Number(reputationMetrics.rating || 0).toFixed(1),
        title: "Reviews & rating",
        description: "Recent buyer feedback and reviews that may need a response.",
        tone: "amber",
        rows: [
          {
            id: "review-count",
            label: "Total reviews",
            value: reputationMetrics.reviewCount || 0,
            detail: "All buyer reviews saved for this store.",
          },
          {
            id: "response-needed",
            label: "Need response",
            value: reputation.reviewsNeedingResponse.length,
            detail: "Reviews waiting for seller follow-up.",
          },
          ...reputation.recentReviews.map((review) => ({
            id: review.id,
            label: review.buyerName || "Buyer review",
            value: `${review.rating || 0}/5`,
            detail: review.comment || review.productName || "No review comment yet",
          })),
        ],
      },
      {
        key: "insights",
        icon: BarChart3,
        label: "Insights",
        value: insightMetrics.productClicks?.value ?? 0,
        title: "Business insights",
        description: "Views, clicks, conversion, customer behavior, and product signals.",
        tone: "green",
        rows: [
          ...metricRows(insightMetrics),
          {
            id: "most-viewed",
            label: "Most viewed product",
            value: productSignals.mostViewed?.views || 0,
            detail: productSignals.mostViewed?.name || "No viewed product yet",
          },
          {
            id: "most-abandoned",
            label: "Most abandoned product",
            value: productSignals.mostAbandoned?.orders || 0,
            detail: productSignals.mostAbandoned?.name || "No product signal yet",
          },
        ],
      },
      {
        key: "payouts",
        icon: Wallet,
        label: "Payouts",
        value: formatCurrency(payouts.availableBalance || 0),
        title: "Payouts",
        description: "Available balance, pending money, withdrawal method, and payout warnings.",
        tone: "blue",
        rows: [
          {
            id: "available",
            label: "Available balance",
            value: formatCurrency(payouts.availableBalance || 0),
            detail: "Money ready for withdrawal.",
          },
          {
            id: "pending",
            label: "Pending balance",
            value: formatCurrency(payouts.pendingBalance || 0),
            detail: "Money still clearing from orders or payouts.",
          },
          {
            id: "method",
            label: "Withdrawal method",
            value: payouts.withdrawalMethod ? "Added" : "Missing",
            detail: payouts.withdrawalMethod?.label || "Add KunThai Money or bank details later.",
          },
          {
            id: "warning",
            label: "Payout warning",
            value: payouts.warning?.active ? "Action" : "None",
            detail: payouts.warning?.description || "No payout warning right now.",
          },
        ],
      },
      {
        key: "care",
        icon: Headphones,
        label: "Customer Care",
        value: careMetrics.unreadMessages || 0,
        title: "Customer care",
        description: "Unread messages, buyer questions, negotiation requests, and support threads.",
        tone: "purple",
        rows: [
          {
            id: "unread",
            label: "Unread messages",
            value: careMetrics.unreadMessages || 0,
            detail: "Buyer messages waiting for a reply.",
          },
          {
            id: "response-time",
            label: "Average response time",
            value: careMetrics.averageResponseTime || "0",
            detail: "How quickly the seller replies.",
          },
          {
            id: "questions",
            label: "Buyer questions",
            value: careMetrics.buyerQuestionsWaiting || 0,
            detail: "Product or order questions waiting.",
          },
          {
            id: "support",
            label: "Support/disputes",
            value: careMetrics.supportDisputes || 0,
            detail: "Threads needing careful customer support.",
          },
          ...care.conversations.map((conversation) => ({
            id: conversation.id,
            label: conversation.buyerName || "Buyer",
            value: conversation.unread ? "Unread" : "Read",
            detail: conversation.preview || conversation.topic || "No message preview",
          })),
        ],
      },
      {
        key: "trust",
        icon: ShieldCheck,
        label: "Trust & Reputation",
        value: `${reputationMetrics.profileCompleteness || 0}%`,
        title: "Trust & reputation",
        description: "Badges, reliability, complaint rate, cancellation rate, and profile completeness.",
        tone: "gray",
        rows: [
          {
            id: "profile",
            label: "Profile completeness",
            value: `${reputationMetrics.profileCompleteness || 0}%`,
            detail: "How complete the seller trust profile is.",
          },
          {
            id: "complaints",
            label: "Complaint rate",
            value: `${reputationMetrics.complaintRate || 0}%`,
            detail: "Buyer complaints compared with orders.",
          },
          {
            id: "cancellations",
            label: "Cancellation rate",
            value: `${reputationMetrics.cancellationRate || 0}%`,
            detail: "Cancelled orders compared with all orders.",
          },
          {
            id: "delivery",
            label: "On-time delivery",
            value: `${reputationMetrics.onTimeDeliveryRate || 0}%`,
            detail: "Orders delivered within the promised window.",
          },
          ...reputation.badges.map((badge) => ({
            id: badge.id,
            label: badge.label,
            value: badge.status === "active" ? "Active" : "Locked",
            detail: badge.status === "active" ? "Badge is active." : "Keep improving to unlock this badge.",
          })),
        ],
      },
    ];
  }, [care, insights, payouts, reputation]);

  const activeItem = items.find((item) => item.key === activeKey) || items[0];

  if (loading) {
    return (
      <section className="animate-pulse rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="h-5 w-44 rounded bg-gray-200" />
        <div className="mt-2 h-4 w-72 rounded bg-gray-100" />
        <div className="mt-4 flex gap-3 overflow-x-auto">
          {[0, 1, 2, 3, 4].map((item) => (
            <div key={item} className="h-24 min-w-[178px] flex-1 rounded-lg bg-gray-100" />
          ))}
        </div>
        <div className="mt-4 h-44 rounded-xl bg-gray-100" />
      </section>
    );
  }

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="mb-4">
        <h3 className="text-base font-black text-gray-950">Seller Intelligence</h3>
        <p className="text-sm font-medium text-gray-500">
          Reviews, insights, payouts, customer care, and trust in one clean view.
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
