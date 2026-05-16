import SellerMenuPageHeader from "./SellerMenuPageHeader";

export default function SellerArticlePage({
  title,
  eyebrow,
  summary,
  sections,
  highlights = [],
  onBack,
}) {
  return (
    <>
      <SellerMenuPageHeader title={title} eyebrow={eyebrow} onBack={onBack} />
      <main className="w-full px-4 py-5 sm:px-6 lg:px-8">
        <section className="rounded-2xl border border-gray-200 bg-gray-950 p-5 text-white shadow-sm sm:p-7">
          <p className="text-xs font-black uppercase tracking-[0.2em] text-emerald-300">
            {eyebrow}
          </p>
          <h1 className="mt-3 text-2xl font-black sm:text-3xl">{title}</h1>
          <p className="mt-3 max-w-5xl text-sm font-semibold leading-7 text-white/75 sm:text-base">
            {summary}
          </p>
        </section>

        {highlights.length ? (
          <section className="mt-5 grid gap-3 md:grid-cols-3">
            {highlights.map((item) => (
              <div
                key={item.title}
                className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm"
              >
                <p className="text-sm font-black text-gray-950">{item.title}</p>
                <p className="mt-2 text-sm font-semibold leading-6 text-gray-600">
                  {item.text}
                </p>
              </div>
            ))}
          </section>
        ) : null}

        <section className="mt-5 space-y-4">
          {sections.map((section) => (
            <article
              key={section.title}
              className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6"
            >
              <h2 className="text-lg font-black text-gray-950">{section.title}</h2>
              {section.paragraphs.map((paragraph) => (
                <p
                  key={paragraph}
                  className="mt-3 text-sm font-semibold leading-7 text-gray-600 sm:text-base"
                >
                  {paragraph}
                </p>
              ))}
            </article>
          ))}
        </section>
      </main>
    </>
  );
}
