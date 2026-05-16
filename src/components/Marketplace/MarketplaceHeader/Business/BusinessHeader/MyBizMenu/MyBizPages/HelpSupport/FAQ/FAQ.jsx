import SellerArticlePage from "../../SellerArticlePage";

const sections = [
  {
    title: "Why should I verify my seller account?",
    paragraphs: [
      "Verification helps buyers know whether they are dealing with a more accountable seller. In a marketplace where money, delivery, and product quality matter, verification is a trust signal. It does not replace good behavior, but it gives buyers more confidence that your business identity has been reviewed.",
      "A seller who is not verified can still list products, but buyers may be more careful before paying. A verified or verification-recommended seller is more likely to receive serious buyer attention because the store looks less risky.",
    ],
  },
  {
    title: "What should I do when a buyer messages about a product?",
    paragraphs: [
      "Reply with the product name, availability, price, condition, location, and delivery or pickup options. If the buyer is asking from a product page, keep the conversation focused on that product first. If the buyer messages from your profile, respond in a normal customer-service style and ask what item or service they need.",
      "Avoid pressuring buyers to pay before they understand the item. A confident seller can explain the product clearly, confirm the order details, and guide the buyer through the safest next step.",
    ],
  },
  {
    title: "How do I avoid disputes?",
    paragraphs: [
      "Disputes usually happen when expectations are unclear. Use real photos, describe product condition honestly, keep prices updated, and do not promise delivery times you cannot meet. If a product has defects, missing parts, limited warranty, or special conditions, say so before the buyer places an order.",
      "When handling orders, confirm the buyer address, phone number, product quantity, final price, and delivery method. Good confirmation protects both sides and makes your store look professional.",
    ],
  },
  {
    title: "What if my product is out of stock?",
    paragraphs: [
      "Update the product quickly and tell interested buyers honestly. Do not accept payment for unavailable items unless the buyer clearly agrees to a preorder or delayed fulfillment. Marketplace trust depends on sellers keeping product availability accurate.",
      "If many products sell fast, use stock alerts and review your listings often. A well-maintained catalog makes your business look active and reliable.",
    ],
  },
];

export default function FAQs({ onBack }) {
  return (
    <SellerArticlePage
      title="FAQs"
      eyebrow="Help & Support"
      onBack={onBack}
      summary="Quick answers for the questions sellers usually face while building trust, responding to buyers, managing orders, and protecting their business reputation."
      highlights={[
        { title: "Trust first", text: "Verification, clear listings, and honest replies help buyers decide faster." },
        { title: "Confirm details", text: "Always confirm price, item, address, and delivery before fulfillment." },
        { title: "Stay accurate", text: "Keep stock, images, and descriptions up to date." },
      ]}
      sections={sections}
    />
  );
}
