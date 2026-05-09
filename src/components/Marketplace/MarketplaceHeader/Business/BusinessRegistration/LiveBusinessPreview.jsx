export default function LiveBusinessPreview({ form, readinessScore }) {
  const name = form.identity.businessName || "Your Business Name";
  const description = form.identity.description || "Short description will appear here.";
  const categories = form.identity.categories.length ? form.identity.categories : ["Category"];
  const city = form.location.city || "City";
  const country = form.location.country || "Country";
  const website = form.location.website?.trim();
  const websiteHref = website ? (/^https?:\/\//i.test(website) ? website : `https://${website}`) : "";

  return (
    <aside className="space-y-4">
      <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <p className="text-sm font-black uppercase text-blue-700">Live Preview</p>
        <div className="mt-4 rounded-xl border border-gray-200 bg-gray-50 p-4">
          <div className="flex gap-3">
            <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-gray-900 text-sm font-black text-white">
              {form.identity.logoName ? "Logo" : "KT"}
            </div>
            <div className="min-w-0">
              <h3 className="truncate text-lg font-black text-gray-950">{name}</h3>
              <p className="text-sm font-bold text-gray-500">{city}, {country}</p>
              <p className="mt-2 text-sm font-medium leading-5 text-gray-600">{description}</p>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {categories.slice(0, 3).map((category) => (
              <span key={category} className="rounded-full bg-white px-3 py-1 text-xs font-black text-gray-700">
                {category}
              </span>
            ))}
          </div>
          {(form.location.email || website) ? (
            <div className="mt-4 flex flex-wrap gap-2 text-xs font-black">
              {form.location.email ? (
                <a href={`mailto:${form.location.email}`} className="rounded-full bg-blue-50 px-3 py-1 text-blue-700 hover:bg-blue-100">
                  Email
                </a>
              ) : null}
              {website ? (
                <a href={websiteHref} target="_blank" rel="noreferrer" className="rounded-full bg-gray-900 px-3 py-1 text-white hover:bg-gray-800">
                  Website
                </a>
              ) : null}
            </div>
          ) : null}
        </div>
      </section>

      <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <p className="font-black text-gray-950">Store readiness</p>
          <p className="text-lg font-black text-blue-700">{readinessScore}%</p>
        </div>
        <div className="mt-3 h-2 rounded-full bg-gray-100">
          <div className="h-2 rounded-full bg-blue-600" style={{ width: `${readinessScore}%` }} />
        </div>
      </section>
    </aside>
  );
}
