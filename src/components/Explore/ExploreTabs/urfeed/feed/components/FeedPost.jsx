// src/Explore/ExploreTabs/urfeed/components/FeedPost.jsx
// ------------------------------------------------------
// Single Feed Post component
// Represents ONE post in the feed
// ------------------------------------------------------

export default function FeedPost({
  author = "Anonymous",
  time = "Just now",
  content = "This is a post",
}) {
  return (
    <div className="bg-white rounded-lg shadow-sm border mb-3">

      {/* =========================
          POST HEADER
      ========================= */}
      <div className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-3">
          {/* Avatar */}
          <div className="w-10 h-10 rounded-full bg-slate-300 flex items-center justify-center">
            👤
          </div>

          {/* Author info */}
          <div>
            <p className="text-sm font-semibold">{author}</p>
            <p className="text-xs text-gray-500">{time}</p>
          </div>
        </div>

        {/* More actions */}
        <button className="text-gray-500 text-xl">⋯</button>
      </div>

      {/* =========================
          POST CONTENT
      ========================= */}
      <div className="px-4 pb-3 text-sm text-gray-800">
        {content}
      </div>

      {/* =========================
          POST ACTIONS
      ========================= */}
      <div className="flex items-center justify-around border-t py-2 text-sm text-gray-600">

        <button className="flex items-center gap-1">
          👍 <span>Like</span>
        </button>

        <button className="flex items-center gap-1">
          💬 <span>Comment</span>
        </button>

        <button className="flex items-center gap-1">
          💾 <span>Save</span>
        </button>

      </div>
    </div>
  );
}
