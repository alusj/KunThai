// =====================================
// MenuButton.jsx
// Hamburger menu button
// =====================================

export default function MenuButton({ onClick }) {
  return (
    <button
      onClick={onClick}
      className="text-2xl"
      aria-label="Open menu"
    >
      ☰
    </button>
  );
}
