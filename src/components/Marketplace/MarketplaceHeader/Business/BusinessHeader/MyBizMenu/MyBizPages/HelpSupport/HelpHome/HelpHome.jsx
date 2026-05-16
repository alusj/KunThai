import SellerArticlePage from "../../SellerArticlePage";

const sections = [
  {
    title: "Building a trusted UrMall store",
    paragraphs: [
      "UrMall is designed for sellers who want buyers to feel confident before they ask a question, place an order, or send payment. A strong store begins with clear identity: a real business name, a recognizable logo, a complete location, accurate contact information, and a description that explains what you sell in plain language. The more complete your profile is, the easier it becomes for buyers to judge whether your store is serious, reachable, and ready to serve them.",
      "Your seller dashboard is not only a place to upload products. It is your business control room. Product quality, response speed, order handling, verification status, delivery options, and message clarity all work together to create trust. When those details are complete, buyers spend less time doubting and more time deciding.",
    ],
  },
  {
    title: "How to get better buyer response",
    paragraphs: [
      "Every product should answer the questions a buyer would naturally ask: what is it, what condition is it in, where is it located, how much does it cost, how fast can it be delivered, and what should the buyer know before paying. Use clear images, honest descriptions, and practical pricing. Avoid vague titles or descriptions that force the buyer to message only to understand the basics.",
      "Messages from buyers should be treated like business opportunities. Reply with the product name, availability, price confirmation, delivery or pickup options, and the next safe step. A professional response does not need to be long, but it should remove uncertainty. The goal is to help buyers feel they are dealing with a real person and a responsible business.",
    ],
  },
  {
    title: "Managing orders with confidence",
    paragraphs: [
      "When an order arrives, confirm the buyer details, selected item, delivery address, and payment expectation before dispatch. If an item is no longer available, update the product stock quickly and communicate clearly. Silent delays damage trust more than honest updates. Buyers can accept many situations when the seller is transparent.",
      "For safer marketplace activity, encourage buyers to use the information shown in the order and seller profile instead of moving the entire transaction into an unclear private channel. Verification, saved addresses, order records, and product messages help both sides keep proof of what was agreed.",
    ],
  },
];

export default function HelpHome({ onBack }) {
  return (
    <SellerArticlePage
      title="Help Home"
      eyebrow="Help & Support"
      onBack={onBack}
      summary="This guide helps sellers use UrMall like a serious marketplace workspace, with stronger profiles, clearer products, safer orders, and better buyer communication."
      highlights={[
        { title: "Complete profile", text: "A complete seller profile makes your store easier to trust and easier to contact." },
        { title: "Clear products", text: "Good photos, honest pricing, and useful descriptions reduce buyer hesitation." },
        { title: "Fast responses", text: "Professional replies turn product interest into real orders." },
      ]}
      sections={sections}
    />
  );
}
