import SellerArticlePage from "../../../SellerArticlePage";

const sections = [
  {
    title: "Using UrMall as a seller",
    paragraphs: [
      "By selling on UrMall, a seller agrees to use the platform for lawful, honest, and professional marketplace activity. This includes providing accurate business information, listing products truthfully, responding to buyers responsibly, honoring confirmed order terms, and keeping account access secure.",
      "The seller is responsible for the products they publish, the prices they display, the promises they make, and the fulfillment choices they offer. UrMall provides the digital marketplace tools, but the seller remains responsible for running the store with care.",
    ],
  },
  {
    title: "Orders, payments, and buyer trust",
    paragraphs: [
      "Orders should be handled according to the details confirmed with the buyer. Sellers should not accept payment for products they cannot provide, should not change final terms after agreement without buyer consent, and should not misrepresent delivery or pickup conditions. Clear order handling protects the seller from disputes and protects the buyer from uncertainty.",
      "Verification status is a trust signal, not a license to behave carelessly. A verified seller must still follow marketplace rules. An unverified seller must understand that buyers may proceed more carefully. UrMall may display caution messages so buyers can make informed decisions before sending money.",
    ],
  },
  {
    title: "Platform enforcement",
    paragraphs: [
      "UrMall may review listings, messages, orders, verification records, reports, and account behavior when safety, fraud, or policy concerns arise. Depending on the issue, the platform may warn a seller, limit a listing, request additional verification, pause marketplace access, or remove content that creates risk.",
      "Enforcement should be guided by fairness and marketplace safety. Honest mistakes can often be corrected, but repeated deception, fake activity, abusive conduct, or refusal to resolve serious buyer issues can lead to stronger action. The aim is to protect a marketplace where real businesses can grow.",
    ],
  },
];

export default function TermsOfService({ onBack }) {
  return (
    <SellerArticlePage
      title="Terms Of Service"
      eyebrow="Privacy & Legal"
      onBack={onBack}
      summary="These terms describe the responsibilities sellers accept when they use UrMall to list products, receive buyer messages, and manage orders."
      highlights={[
        { title: "Responsibility", text: "Sellers are responsible for their listings, prices, messages, and fulfillment promises." },
        { title: "Trust", text: "Verification helps buyers decide, but every seller must behave honestly." },
        { title: "Fair action", text: "UrMall may review and act on unsafe, fraudulent, or abusive marketplace behavior." },
      ]}
      sections={sections}
    />
  );
}
