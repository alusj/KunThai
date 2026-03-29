// =====================================
// HeaderMenu.jsx
// Slide-out menu drawer
// =====================================

export default function HeaderMenu({ open, onClose }) {
  if (!open) return null;

  return (
    <>
      {/* BACKDROP */}
      <div
        onClick={onClose}
        className="fixed inset-0 bg-black/40 z-40"
      />

      {/* MENU */}
      <aside className="fixed top-0 left-0 h-full w-64 bg-white z-50 shadow-lg">
        <div className="p-4 space-y-4">
          <h2 className="text-lg font-semibold">Menu</h2>

          <button className="block w-full text-left py-2">👤 Profile</button>
          <button className="block w-full text-left py-2">⚙️ Settings</button>
          <button className="block w-full text-left py-2">🔖 Saved</button>
          <button className="block w-full text-left py-2">❓ Help</button>

          <hr />

          <button
            onClick={onClose}
            className="block w-full text-left py-2 text-red-600"
          >
            Close
          </button>
        </div>
      </aside>
    </>
  );
}
