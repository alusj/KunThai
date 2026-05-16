import SellerArticlePage from "../../SellerArticlePage";

const sections = [
  {
    title: "Why payout history is not active yet",
    paragraphs: [
      "Withdrawal history is currently not available because seller payouts have not been launched inside UrMall yet. A payout history should only show real settlements from marketplace payments. Since the payment service is still being prepared, there are no official payout entries to display.",
      "This is intentional. We want sellers to see trustworthy payout records, not placeholder balances or simulated financial activity. When the payment service is ready, payout history should become a reliable record of money released to the seller.",
    ],
  },
  {
    title: "What this page will support later",
    paragraphs: [
      "After launch, payout history should help sellers understand how much money has been released, which orders funded the payout, what is still pending, and whether any withdrawal failed or needs attention. That kind of clarity is important because sellers need to plan stock, delivery, and business cash flow.",
      "The goal is to connect payouts to actual item sales so a seller can move from product to order to payment to withdrawal without confusion. That is why this feature is being treated as part of a proper payment system, not a separate empty page.",
    ],
  },
  {
    title: "What to do until payouts launch",
    paragraphs: [
      "Until payouts are active, agree payment arrangements carefully with buyers and keep your own payment notes. Make sure every payment conversation is connected to a product and order details. If anything feels suspicious, slow down and confirm before releasing goods.",
      "Professional sellers should communicate in a way that helps buyers feel safe sending money: state the item, price, delivery plan, and confirmation process. Good payment communication is part of selling well, especially before built-in payouts are available.",
    ],
  },
];

export default function WithdrawalHistory({ onBack }) {
  return (
    <SellerArticlePage
      title="Withdrawal History"
      eyebrow="Payments & Payouts"
      onBack={onBack}
      summary="Withdrawal history will become available when UrMall enables official seller payouts from item-based payments."
      highlights={[
        { title: "No payouts yet", text: "This section will activate when built-in seller withdrawals are launched." },
        { title: "Real records", text: "Payout history should reflect actual payment settlements, not placeholders." },
        { title: "Communicate clearly", text: "Until launch, explain payment arrangements carefully to buyers." },
      ]}
      sections={sections}
    />
  );
}
