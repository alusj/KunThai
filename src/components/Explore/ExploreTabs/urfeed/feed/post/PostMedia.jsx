export default function PostMedia({ post }) {
  return (
    <>
      {post.image_url ? (
        <div className="px-4 pb-4">
          <img src={post.image_url} alt="Post attachment" className="max-h-[520px] w-full rounded-[20px] object-cover" />
        </div>
      ) : null}

      {post.video_url ? (
        <div className="px-4 pb-4">
          <video controls src={post.video_url} className="max-h-[520px] w-full rounded-[20px] bg-slate-950 object-cover" />
        </div>
      ) : null}

      {post.audio_url ? (
        <div className="px-4 pb-4">
          <div className="rounded-[20px] border border-slate-200 bg-slate-50 p-4">
            <p className="mb-2 text-sm font-bold text-slate-900">Voice note</p>
            <audio controls src={post.audio_url} className="w-full" />
            {post.audio_duration_seconds ? (
              <p className="mt-2 text-xs font-semibold text-slate-500">{post.audio_duration_seconds}s</p>
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  );
}
