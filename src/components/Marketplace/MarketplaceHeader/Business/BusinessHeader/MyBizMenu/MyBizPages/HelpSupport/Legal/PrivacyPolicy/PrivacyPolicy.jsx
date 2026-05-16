import SellerArticlePage from "../../../SellerArticlePage";

const sections = [
  {
    title: "Our privacy promise",
    paragraphs: [
      "UrMall depends on trust. Sellers share business names, contact details, store locations, product records, order activity, verification information, and messages because the marketplace needs that information to help buyers and sellers trade safely. Our responsibility is to use that information for clear platform purposes and to protect it from careless exposure.",
      "We collect the information needed to operate seller accounts, display public store profiles, process marketplace actions, support orders, investigate disputes, improve safety, and provide customer support. We do not ask for unnecessary information simply to fill a database. Each detail should help buyers find reliable sellers, help sellers operate professionally, or help the platform reduce fraud and confusion.",
    ],
  },
  {
    title: "What buyers can see",
    paragraphs: [
      "Some seller information is public by design. Buyers may see your store name, logo, business category, city, country, public contact options, verification status, product listings, delivery or pickup availability, and other details you choose to publish. This visibility is part of selling on a marketplace. A buyer cannot trust a store that hides everything about itself.",
      "Sensitive information should remain protected. Internal account identifiers, private verification documents, precise backend location coordinates, security records, and payout details are not meant to be shown publicly. Where location is useful to buyers, the platform should show practical address information while keeping backend technical data controlled.",
    ],
  },
  {
    title: "How information is protected",
    paragraphs: [
      "Privacy protection is both technical and operational. Access to seller information should be limited to the seller, authorized platform systems, and support processes that need the information to resolve a legitimate issue. Security rules, account permissions, and database policies help keep private records from being exposed to the wrong users.",
      "Sellers also play a role in privacy. Do not publish personal documents, private payment details, passwords, or unnecessary buyer information in product descriptions, images, or public messages. A professional marketplace is strongest when both the platform and its users treat private information with care.",
    ],
  },
];

export default function PrivacyPolicy({ onBack }) {
  return (
    <SellerArticlePage
      title="Privacy Policy"
      eyebrow="Privacy & Legal"
      onBack={onBack}
      summary="This policy explains how UrMall treats seller and buyer information so the marketplace can remain useful, transparent, and safe."
      highlights={[
        { title: "Purposeful data", text: "Information is used to run accounts, orders, safety checks, support, and marketplace discovery." },
        { title: "Public trust", text: "Some seller details are visible because buyers need confidence before doing business." },
        { title: "Protected records", text: "Private documents, payout information, and backend-only data should remain controlled." },
      ]}
      sections={sections}
    />
  );
}
