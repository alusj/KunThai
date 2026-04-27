import EmptyState from "../../../shared/EmptyState";

export default function CategoryEmpty({ title }) {
  return (
    <div className="p-4">
      <EmptyState
        title={`${title} videos are coming soon`}
        message="For now, all uploaded Swip videos appear in the All tab."
      />
    </div>
  );
}
