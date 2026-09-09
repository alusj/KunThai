import { useCallback, useEffect, useState } from "react";
import { listRentalReviews, saveRentalReview, listRentalReservations } from "../../services/transportRentalService";

export default function RentalReviews({ rentalId, manager = false }) {
  const [reviews, setReviews] = useState([]);
  const [eligible, setEligible] = useState(false);
  const [rating, setRating] = useState("5");
  const [body, setBody] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const refresh = useCallback(async () => { setReviews(await listRentalReviews(rentalId)); }, [rentalId]);
  useEffect(() => { let active = true; refresh().catch((err) => { if (active) setError(err.message); }); if (!manager) listRentalReservations(rentalId).then((rows) => { if (active) setEligible(rows.some((row) => row.status === "completed")); }).catch(() => {}); return () => { active = false; }; }, [refresh, rentalId, manager]);
  return <section className="space-y-4"><h2 className="text-xl font-black">Rental reviews</h2>{error && <p role="alert" className="text-rose-700">{error}</p>}{!reviews.length && <p className="text-sm text-slate-600">No reviews yet. Renters can review after returning the vehicle.</p>}{reviews.map((review) => <article key={review.id} className="rounded-2xl border border-slate-200 bg-white p-4"><p className="font-bold text-amber-700">{"★".repeat(review.rating)}{"☆".repeat(5 - review.rating)} · Verified rental</p><p className="mt-2 whitespace-pre-line text-slate-700">{review.body}</p></article>)}{eligible && <form className="space-y-3 rounded-2xl border bg-white p-4" onSubmit={async (event) => { event.preventDefault(); setBusy(true); setError(""); try { await saveRentalReview(rentalId, Number(rating), body); await refresh(); } catch (err) { setError(err.message); } finally { setBusy(false); } }}><label className="block font-bold">Your rating<select value={rating} onChange={(event) => setRating(event.target.value)} className="ml-3 rounded-xl border p-2">{[5,4,3,2,1].map((value) => <option key={value}>{value}</option>)}</select></label><textarea aria-label="Your rental review" required maxLength={2000} value={body} onChange={(event) => setBody(event.target.value)} className="w-full rounded-xl border p-3" /><button disabled={busy} className="rounded-xl bg-emerald-700 px-4 py-3 font-bold text-white">{busy ? "Saving…" : "Save review"}</button></form>}</section>;
}
