// CartButton.jsx
// Header cart icon with badge

export default function CartButton({ count, onClick }) {
  return (
    <button
      onClick={onClick}
      className="relative text-xl"
    >
      🛒

      {/* Badge showing number of cart items */}
      {count > 0 && (
        <span className="absolute -top-2 -right-2 bg-red-500 text-white text-xs
                         rounded-full min-w-[18px] h-[18px] grid place-items-center">
          {count}
        </span>
      )}
    </button>
  );
}
