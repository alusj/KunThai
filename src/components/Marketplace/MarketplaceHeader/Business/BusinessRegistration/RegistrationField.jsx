export default function RegistrationField({ label, error, children }) {
  return (
    <label className="block" data-field-error={error ? "true" : undefined}>
      <span className="text-sm font-black text-gray-800">{label}</span>
      <div className="mt-2">{children}</div>
      {error ? <p className="mt-1 text-xs font-bold text-red-600">{error}</p> : null}
    </label>
  );
}
