import SellerArticlePage from "../../SellerArticlePage";

const sections = [
  {
    title: "Transaction records are coming",
    paragraphs: [
      "Transactions are currently not available because UrMall is still building the payment service that will generate official marketplace payment records. Once that service is active, this page should show item payments, order totals, charges, refunds, pending settlements, and completed seller receipts.",
      "We are avoiding fake or incomplete transaction screens because sellers need financial information they can trust. A transaction page should not simply look active. It should reflect real payment activity connected to real orders.",
    ],
  },
  {
    title: "How to communicate money details now",
    paragraphs: [
      "For now, explain money details to buyers in a careful and professional way. Confirm the exact item, quantity, agreed price, delivery fee, payment timing, and what happens after payment. If the buyer is paying before delivery, make sure the buyer understands the seller identity and the product being paid for.",
      "Use simple language and avoid rushing the buyer. A good message sounds like: 'This payment is for one item, the final price is confirmed, delivery is included or excluded, and your order will be prepared after confirmation.' Clear payment communication reduces suspicion and prevents arguments.",
    ],
  },
  {
    title: "Keeping your own records",
    paragraphs: [
      "Until UrMall transactions are live, sellers should keep private records of payments received, buyer names, item names, dates, delivery arrangements, and any proof of payment. Good records help you answer buyer questions and resolve issues faster.",
      "When built-in transactions launch, UrMall should make this process easier by tying payment records directly to item orders and seller dashboards. The long-term goal is less manual tracking and more confidence for both sides.",
    ],
  },
];

export default function Transactions({ onBack }) {
  return (
    <SellerArticlePage
      title="Transactions"
      eyebrow="Payments & Payouts"
      onBack={onBack}
      summary="Transaction records will become available when UrMall's item-based payment service is launched."
      highlights={[
        { title: "Not active yet", text: "Official marketplace transactions will appear only after payments go live." },
        { title: "Clear terms", text: "Confirm item, price, fees, and payment timing with every buyer." },
        { title: "Keep proof", text: "Maintain private records until UrMall transaction tracking is available." },
      ]}
      sections={sections}
    />
  );
}
