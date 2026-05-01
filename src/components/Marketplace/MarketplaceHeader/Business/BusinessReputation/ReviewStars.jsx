export default function ReviewStars({ rating }) {
  return (
    <span className="text-sm font-black text-amber-500">
      {"*".repeat(rating)}
      <span className="text-gray-300">{"*".repeat(5 - rating)}</span>
    </span>
  );
}
