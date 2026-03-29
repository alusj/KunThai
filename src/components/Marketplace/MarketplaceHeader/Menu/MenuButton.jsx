// MenuButton.jsx
// Hamburger menu button in header

export default function MenuButton({ onClick }) {
  return (
    <button
      onClick={onClick}
      className="text-2xl"
    >
      ☰
    </button>
  );
}
