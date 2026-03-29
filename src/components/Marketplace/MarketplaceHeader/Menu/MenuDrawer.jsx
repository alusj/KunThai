// MenuDrawer.jsx
// Slide-in menu drawer

export default function MenuDrawer({ open, onClose }) {
  return (
    <>
      {/* Backdrop */}
      {open && (
        <div
          onClick={onClose}
          className="fixed inset-0 bg-black/40 z-40"
        />
      )}

      {/* Drawer */}
      <div
        className={`fixed top-0 right-0 h-full w-64 bg-white z-50 shadow-lg
                    transform transition-transform duration-300
                    ${open ? "translate-x-0" : "translate-x-full"}`}
      >
        <div className="p-4 border-b flex justify-between items-center">
          <h3 className="font-semibold text-lg">Menu</h3>
          <button onClick={onClose}>✕</button>
        </div>

        <div className="p-4 space-y-4">
          <button className="block w-full text-left">👤 Profile</button>
          <button className="block w-full text-left">🧾 Orders</button>
          <button className="block w-full text-left">⚙️ Settings</button>
          <button className="block w-full text-left text-red-600">
            🚪 Logout
          </button>
        </div>
      </div>
    </>
  );
}
