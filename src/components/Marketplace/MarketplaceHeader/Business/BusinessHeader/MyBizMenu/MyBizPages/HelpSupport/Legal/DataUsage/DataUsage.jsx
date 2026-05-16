import SellerArticlePage from "../../../SellerArticlePage";

const sections = [
  {
    title: "Why UrMall uses data",
    paragraphs: [
      "Data helps UrMall make the marketplace useful instead of random. Store categories help buyers discover the right sellers. Product information helps search and recommendations. Order records help sellers track business activity. Messages help both sides understand what was discussed. Verification status helps buyers decide how carefully to proceed before sending money.",
      "The platform should use data to support real commerce: better discovery, safer payments, clearer delivery, fraud prevention, product performance, seller insights, support investigation, and marketplace improvement. Data should not be treated as decoration. If the platform asks for information, that information should help the seller, the buyer, or the safety of the marketplace.",
    ],
  },
  {
    title: "Operational and safety use",
    paragraphs: [
      "Operational data includes listings, prices, stock, orders, delivery options, saved addresses, business hours, and communication history. This information allows UrMall to show accurate products, create orders, update dashboards, and give sellers practical tools for running their store.",
      "Safety data includes verification status, dispute history, suspicious activity signals, reported messages, account access information, and marketplace behavior patterns. This information helps detect fake sellers, protect buyers from risky transactions, and protect honest sellers from false or abusive activity.",
    ],
  },
  {
    title: "Seller control and responsibility",
    paragraphs: [
      "Sellers should keep their business data accurate because inaccurate data can damage buyer trust. A wrong phone number, outdated stock count, unclear address, or misleading product image can cause failed orders and complaints. Good data is not only a technical issue. It is part of professional selling.",
      "Sellers should also avoid collecting unnecessary buyer information outside the order process. Ask only for what is needed to complete the sale, delivery, pickup, or support request. Responsible data use helps UrMall become a marketplace where people can do business without feeling exposed or unsafe.",
    ],
  },
];

export default function DataUsage({ onBack }) {
  return (
    <SellerArticlePage
      title="Data Usage"
      eyebrow="Privacy & Legal"
      onBack={onBack}
      summary="UrMall uses marketplace data to power discovery, orders, communication, seller insights, fraud prevention, and support."
      highlights={[
        { title: "Commerce", text: "Data helps buyers find products and helps sellers manage orders." },
        { title: "Safety", text: "Verification and behavior signals help reduce fake marketplace activity." },
        { title: "Accuracy", text: "Sellers are expected to keep product and business data current." },
      ]}
      sections={sections}
    />
  );
}
