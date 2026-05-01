export default function BusinessLogo({ initials, logoUrl }) {
  if (logoUrl) {
    return (
      <img
        src={logoUrl}
        alt=""
        className="h-16 w-16 shrink-0 rounded-xl object-cover"
      />
    );
  }

  return (
    <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl bg-gray-900 text-base font-bold text-white">
      {initials}
    </div>
  );
}
