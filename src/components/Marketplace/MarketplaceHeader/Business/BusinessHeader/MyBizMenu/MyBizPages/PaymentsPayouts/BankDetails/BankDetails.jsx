import SellerArticlePage from "../../SellerArticlePage";

const sections = [
  {
    title: "Why bank setup is paused",
    paragraphs: [
      "Bank details are currently not available because UrMall is preparing a payment service that will connect directly to your listed items, buyer orders, seller dashboard, and payout records. We do not want sellers entering sensitive payment information into a section before the full payment flow is ready to protect it and use it correctly.",
      "A professional marketplace payment system should do more than store an account number. It should understand the item being sold, the order amount, the buyer, the seller, the delivery or pickup state, and the payout status. That is the service being prepared.",
    ],
  },
  {
    title: "How to handle payment for now",
    paragraphs: [
      "Until built-in payments are active, discuss payment clearly with the buyer before completing the order. Confirm the product name, final price, delivery fee if any, pickup or delivery arrangement, buyer phone number, and expected payment method. Clear communication protects your business and makes the buyer feel respected.",
      "Avoid sending confusing or changing payment instructions. If you share payment details outside the platform, make sure the buyer understands exactly what the payment is for. Keep product and order conversations inside UrMall where possible so there is a record of what was agreed.",
    ],
  },
  {
    title: "What sellers can expect next",
    paragraphs: [
      "When the payment service becomes available, this section should become the place to manage payout identity, approved payment routes, settlement status, and seller withdrawal information. The goal is to help sellers receive money with better confidence and less manual explanation.",
      "For now, treat this page as a readiness notice. Keep your seller profile, verification status, product listings, and order details accurate so your store is prepared when payment tools become active.",
    ],
  },
];

export default function BankDetails({ onBack }) {
  return (
    <SellerArticlePage
      title="Bank Details"
      eyebrow="Payments & Payouts"
      onBack={onBack}
      summary="Bank details are currently not available while UrMall prepares a safer payment service connected to products, orders, and seller payouts."
      highlights={[
        { title: "Coming soon", text: "Bank setup will open when the payment service is ready for seller payouts." },
        { title: "Protect details", text: "Sensitive payout information should only be collected when it can be handled properly." },
        { title: "Prepare now", text: "Complete your profile and verification so your store is ready for payment tools." },
      ]}
      sections={sections}
    />
  );
}
