import ReviewItem from "./ReviewItem";
import { uiText as translateUi, useI18n as useUiLocale } from "../../../../../i18n/index.js";

export default function ReviewList({ title, reviews, showRespond = false }) {
  useUiLocale();
  if (!reviews.length) {
    return null;
  }

  return (
    <section className="space-y-3">
      <h4 className="font-black text-gray-950">{translateUi(title)}</h4>
      <div className="space-y-3">
        {reviews.map((review) => (
          <ReviewItem key={review.id} review={review} showRespond={showRespond} />
        ))}
      </div>
    </section>
  );
}
