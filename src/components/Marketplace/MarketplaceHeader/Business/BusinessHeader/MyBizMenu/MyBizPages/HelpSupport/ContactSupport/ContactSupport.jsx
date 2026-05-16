import SellerArticlePage from "../../SellerArticlePage";

const sections = [
  {
    title: "When to contact support",
    paragraphs: [
      "Contact support when an issue affects your ability to sell safely, manage orders, communicate with buyers, receive payments, or keep your business profile accurate. UrMall support should be used for account access problems, verification questions, suspicious buyer behavior, product listing errors, order disputes, payout concerns, and marketplace features that do not behave as expected.",
      "Before requesting help, gather the important details: order reference, product name, buyer name if available, screenshots, transaction context, and a short explanation of what happened. A complete support request helps the team understand the issue quickly and reduces back-and-forth.",
    ],
  },
  {
    title: "How support reviews a seller issue",
    paragraphs: [
      "Support reviews the facts first. That means checking the seller profile, product information, message history, order status, verification state, and any evidence shared by the seller or buyer. The goal is not to punish honest mistakes. The goal is to protect the marketplace from confusion, fraud, and avoidable disputes.",
      "If the issue involves a buyer complaint, support may compare the product description with what was delivered or promised. If the issue involves payment or delivery, support may ask for confirmation from both sides. Sellers who keep clear records and communicate inside the platform are easier to protect because the history is visible and organized.",
    ],
  },
  {
    title: "What makes a strong support request",
    paragraphs: [
      "A strong request is calm, specific, and complete. Write what you expected to happen, what actually happened, when it happened, and what help you need. Avoid sending only a short message such as 'my order has problem' or 'buyer is disturbing me.' Support can act faster when the issue is described clearly.",
      "Use professional language even when the situation is frustrating. UrMall is a business environment, and respectful communication helps support focus on solving the matter. If a buyer is abusive, threatening, or attempting fraud, report the behavior clearly and include proof.",
    ],
  },
];

export default function ContactSupport({ onBack }) {
  return (
    <SellerArticlePage
      title="Contact Support"
      eyebrow="Help & Support"
      onBack={onBack}
      summary="Seller support exists to protect serious businesses, resolve marketplace issues, and help buyers and sellers complete transactions with confidence."
      highlights={[
        { title: "Be specific", text: "Include product names, order details, dates, and screenshots where possible." },
        { title: "Stay professional", text: "Clear and respectful reports are easier to investigate and resolve." },
        { title: "Keep records", text: "Use platform messages and order tools so support can review the facts." },
      ]}
      sections={sections}
    />
  );
}
