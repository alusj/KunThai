// src/Explore/ExploreTabs/urfeed/components/FeedComposer.jsx
// ---------------------------------------------
// Composer for creating a new feed post
// ---------------------------------------------

export default function FeedComposer() {
  return (
    <div className="bg-white border-b px-3 py-2">
      <div className="flex items-center gap-3">

        {/* Text input */}
        <input
          type="text"
          placeholder="Write something..."
          className="
            flex-1
            bg-slate-100
            rounded-full
            px-4
            py-2
            text-sm
            outline-none
            focus:bg-white
            focus:ring-1
            focus:ring-blue-400
          "
        />

        {/* Voice post */}
        <button
          className="text-xl text-gray-600"
          aria-label="Record voice"
        >
          🎤
        </button>

        {/* Media upload */}
        <button
          className="text-xl text-gray-600"
          aria-label="Add image or video"
        >
          ➕
        </button>
      </div>
    </div>
  );
}
