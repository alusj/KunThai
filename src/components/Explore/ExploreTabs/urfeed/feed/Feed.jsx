import FeedComposer from "./components/FeedComposer";
import FeedList from "./FeedList";

export default function Feed() {
  return (
    <div className="w-full">

      {/* Composer */}
      <FeedComposer />

      {/* Feed content */}
      <FeedList />
    </div>
  );
}
