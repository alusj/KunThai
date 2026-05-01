import ReviewStars from "./ReviewStars";

export default function ReviewItem({ review, showRespond = false }) {
  return (
    <article className="rounded-lg border border-gray-200 bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-black text-gray-950">{review.buyerName}</p>
          <p className="mt-1 text-xs font-bold uppercase text-gray-400">
            {review.productName}
          </p>
        </div>
        <span className="text-xs font-bold text-gray-400">{review.time}</span>
      </div>

      <div className="mt-2">
        <ReviewStars rating={review.rating} />
      </div>

      <p className="mt-2 text-sm font-medium leading-5 text-gray-600">
        {review.comment}
      </p>

      {showRespond ? (
        <button
          type="button"
          className="mt-3 rounded-lg border border-gray-200 px-3 py-2 text-xs font-black text-gray-800 hover:bg-gray-50"
          onClick={() => console.log("Respond to review", review.id)}
        >
          Respond
        </button>
      ) : null}
    </article>
  );
}
