export default function ProfileEditForm({ onChange, values }) {
  return (
    <section className="grid gap-2 rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm sm:grid-cols-2">
      <input
        value={values.displayName || ""}
        onChange={(event) => onChange("displayName", event.target.value)}
        className="rounded-xl bg-slate-50 px-3 py-2 text-base font-semibold text-slate-950 outline-none focus:ring-2 focus:ring-sky-500/20"
        placeholder="Display name"
      />
      <input
        value={values.username || ""}
        onChange={(event) => onChange("username", event.target.value)}
        className="rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-700 outline-none focus:ring-2 focus:ring-sky-500/20"
        placeholder="username"
      />
      <textarea
        value={values.bio || ""}
        onChange={(event) => onChange("bio", event.target.value)}
        className="min-h-24 rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-700 outline-none focus:ring-2 focus:ring-sky-500/20 sm:col-span-2"
        placeholder="Bio"
      />
      <input
        value={values.email || ""}
        onChange={(event) => onChange("email", event.target.value)}
        className="rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-700 outline-none focus:ring-2 focus:ring-sky-500/20"
        placeholder="Email"
      />
      <input
        value={values.phone || ""}
        onChange={(event) => onChange("phone", event.target.value)}
        className="rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-700 outline-none focus:ring-2 focus:ring-sky-500/20"
        placeholder="Phone"
      />
    </section>
  );
}
