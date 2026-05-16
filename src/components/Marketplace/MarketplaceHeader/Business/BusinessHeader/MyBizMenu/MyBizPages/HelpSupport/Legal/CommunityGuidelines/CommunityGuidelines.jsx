import SellerArticlePage from "../../../SellerArticlePage";

const sections = [
  {
    title: "Professional marketplace behavior",
    paragraphs: [
      "UrMall is built for serious buying and selling. Sellers should communicate respectfully, describe products honestly, honor confirmed agreements, and treat buyers as customers, not interruptions. Buyers should also communicate respectfully, ask clear questions, and avoid wasting sellers' time with false orders or abusive messages.",
      "Professional behavior does not mean every transaction will be perfect. It means problems are handled with clarity. If a product is delayed, say so. If the buyer gave the wrong address, confirm the correction. If a listing has an error, update it. Trust grows when people can see that a seller is responsible even when something changes.",
    ],
  },
  {
    title: "Fraud, abuse, and unsafe activity",
    paragraphs: [
      "Fake products, misleading prices, stolen images, false verification claims, payment deception, harassment, threats, and repeated order manipulation are not acceptable. These actions make buyers afraid to use the marketplace and make honest sellers look suspicious. UrMall should protect the space for real businesses by taking these issues seriously.",
      "Sellers should never ask buyers for sensitive information that is not needed for the order. Buyers should never pressure sellers into unsafe delivery, unclear payment arrangements, or behavior that bypasses marketplace protections. When either side notices suspicious activity, it should be reported with evidence.",
    ],
  },
  {
    title: "Listing standards",
    paragraphs: [
      "A product listing should be truthful, inspectable, and understandable. Use real product photos whenever possible. Do not hide damage, exaggerate quality, or list products you cannot supply. If an item is used, refurbished, imported, preorder-only, negotiable, limited stock, or available only in certain locations, make that clear.",
      "Good listing standards help the whole marketplace. Buyers learn that UrMall products can be trusted, and serious sellers benefit because they are not competing against dishonest listings designed only to attract clicks.",
    ],
  },
];

export default function CommunityGuidelines({ onBack }) {
  return (
    <SellerArticlePage
      title="Community Guidelines"
      eyebrow="Privacy & Legal"
      onBack={onBack}
      summary="These guidelines explain the behavior expected from sellers and buyers so UrMall can remain a trusted place for real marketplace activity."
      highlights={[
        { title: "Respect", text: "Messages and disputes should stay professional, direct, and safe." },
        { title: "Honesty", text: "Products, prices, stock, and delivery promises must be accurate." },
        { title: "Protection", text: "Fraud, threats, and misleading activity should be reported and reviewed." },
      ]}
      sections={sections}
    />
  );
}
