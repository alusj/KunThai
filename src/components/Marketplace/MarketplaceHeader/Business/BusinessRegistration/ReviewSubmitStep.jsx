export default function ReviewSubmitStep({ registration }) {
  const { form, readinessScore, goToStep } = registration;

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-gray-200 bg-white p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="font-black text-gray-950">Store readiness</p>
            <p className="text-sm font-medium text-gray-500">You can improve this after submission.</p>
          </div>
          <p className="text-2xl font-black text-blue-700">{readinessScore}%</p>
        </div>
      </section>

      <SummaryCard title="Business Identity" onEdit={() => goToStep(0)}>
        <p>{form.identity.businessName}</p>
        <p>{form.identity.categories.join(", ")}</p>
        <p>{form.identity.description}</p>
      </SummaryCard>

      <SummaryCard title="Location & Contact" onEdit={() => goToStep(1)}>
        <p>{form.location.city}, {form.location.country}</p>
        <p>{form.location.address}</p>
        {form.location.website ? <p>{form.location.website}</p> : null}
        <p>{form.location.phone} · {form.location.email}</p>
      </SummaryCard>

      <SummaryCard title="Operations" onEdit={() => goToStep(2)}>
        <p>Type: {form.operations.businessType}</p>
        <p>Delivery: {form.operations.deliveryEnabled ? "Yes" : "No"} · Pickup: {form.operations.pickupEnabled ? "Yes" : "No"}</p>
        <p>{form.operations.openTime} - {form.operations.closeTime}</p>
      </SummaryCard>

      <SummaryCard title="Trust & Payout" onEdit={() => goToStep(3)}>
        <p>
          {form.trustPayout.skipped
            ? "Skipped for now"
            : form.trustPayout.connectKunThaiMoney
              ? "KunThai Money connected"
              : "Bank fallback selected"}
        </p>
        <p>ID: {form.trustPayout.idDocumentName || "Not uploaded yet"}</p>
        <p>Business document: {form.trustPayout.businessDocumentName || "Not uploaded yet"}</p>
      </SummaryCard>
    </div>
  );
}

function SummaryCard({ title, onEdit, children }) {
  return (
    <section className="rounded-xl border border-gray-200 bg-white p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="font-black text-gray-950">{title}</h3>
        <button type="button" onClick={onEdit} className="text-sm font-black text-blue-700">
          Edit
        </button>
      </div>
      <div className="space-y-1 text-sm font-medium text-gray-600">{children}</div>
    </section>
  );
}
