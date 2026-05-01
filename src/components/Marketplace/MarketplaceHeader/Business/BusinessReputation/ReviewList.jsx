import ReviewItem from "./ReviewItem";

export default function ReviewList({ title, reviews, showRespond = false }) {
  if (!reviews.length) {
    return null;
  }

  return (
    <section className="space-y-3">
      <h4 className="font-black text-gray-950">{title}</h4>
      <div className="space-y-3">
        {reviews.map((review) => (
          <ReviewItem key={review.id} review={review} showRespond={showRespond} />
        ))}
      </div>
    </section>
  );
}
