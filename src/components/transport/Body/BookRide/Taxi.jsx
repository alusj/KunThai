export default function Taxi() {
  return (
    <button
      className="
        flex flex-col items-center justify-center
        bg-gray-50
        border border-gray-200
        rounded-2xl
        p-3
        hover:bg-green-50
        hover:border-green-300
        hover:shadow-md
        transition-all
      "
    >
      <span className="text-2xl">🚕</span>
     {/* <span className="text-xs mt-2 font-medium text-gray-600">
        Taxi
      </span>*/}
    </button>
  );
}