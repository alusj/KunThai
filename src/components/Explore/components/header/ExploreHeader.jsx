import { useState } from "react";
import {
  HiOutlineMagnifyingGlass,
  HiOutlineMicrophone,
  HiOutlinePencilSquare,
  HiOutlinePhoto,
  HiOutlinePlayCircle,
} from "react-icons/hi2";

import { useExploreNotifications } from "../../../../Backend/hooks/useExploreNotifications";
import HeaderMenu from "./HeaderMenu";
import MenuButton from "./MenuButton";
import MessageButton from "./MessageButton";
import SearchButton from "./SearchButton";
import CreateButton from "./CreateButton";
import AlertButton from "./AlertButton";

function readSearchResults(query) {
  const value = query.trim().toLowerCase();

  if (!value) {
    return [];
  }

  const keys = ["explore-posts-feed", "explore-posts-connections", "explore-posts-swip"];
  const posts = keys.flatMap((key) => {
    try {
      const items = JSON.parse(localStorage.getItem(key) || "[]");
      return Array.isArray(items) ? items : [];
    } catch {
      return [];
    }
  });

  const uniquePosts = Array.from(new Map(posts.map((post) => [post.id, post])).values());
  return uniquePosts
    .filter((post) => {
      const haystack = [post.body, post.author_name, post.author_username].filter(Boolean).join(" ").toLowerCase();
      return haystack.includes(value);
    })
    .slice(0, 8);
}

export default function ExploreHeader({ onAlertsClick, onNavigate, onCreateSelect }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const { notifications, unreadCount } = useExploreNotifications();
  const latestMessage = notifications[0]?.message || "";
  const searchResults = readSearchResults(searchQuery);

  function selectCreateType(type) {
    setCreateOpen(false);
    onCreateSelect?.(type);
  }

  function openSearchResult(postId) {
    setSearchOpen(false);
    setSearchQuery("");
    window.location.hash = `post-${postId}`;
    setTimeout(() => document.getElementById(`post-${postId}`)?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  }

  function runSearch() {
    if (searchResults[0]?.id) {
      openSearchResult(searchResults[0].id);
    }
  }

  function closeSearch() {
    setSearchOpen(false);
    setSearchQuery("");
  }

  return (
    <>
      <header className="border-b border-slate-200 bg-white/95 backdrop-blur">
        {searchOpen ? (
          <>
            <button
              type="button"
              aria-label="Close search"
              onClick={closeSearch}
              className="fixed inset-0 z-40 cursor-default bg-transparent"
            />
          <div className="absolute inset-x-3 top-3 z-50 sm:inset-x-5">
            <div className="flex h-11 items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 text-slate-500 shadow-xl">
              <HiOutlineMagnifyingGlass className="flex-none text-lg" />
              <input
                type="text"
                autoFocus
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") runSearch();
                  if (event.key === "Escape") closeSearch();
                }}
                placeholder="Search people, posts, videos..."
                className="min-w-0 flex-1 bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400"
              />
              <button
                type="button"
                onClick={runSearch}
                className="flex-none rounded-xl bg-slate-950 px-3 py-2 text-xs font-semibold text-white"
              >
                Search
              </button>
            </div>
          </div>
          </>
        ) : null}
        <div className="grid h-16 w-full grid-cols-[1fr_auto_1fr] items-center gap-2 px-3 sm:px-5">
          <div className="flex min-w-0 items-center gap-1.5 sm:gap-2">
            <MenuButton onClick={() => setMenuOpen(true)} />
            <MessageButton onClick={() => onNavigate?.("Messages")} />
          </div>

          <div className="min-w-0 text-center leading-none">
            <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-sky-700 sm:text-[11px]">KunThai</p>
            <h1 className="mt-1 text-[14px] font-semibold text-slate-900 sm:text-[15px]">Explore</h1>
          </div>

          <div className="flex min-w-0 items-center justify-end gap-1.5 sm:gap-2">
            <SearchButton onClick={() => setSearchOpen(true)} />
            <div className="relative">
              <CreateButton onClick={() => setCreateOpen((current) => !current)} />
              {createOpen ? (
                <div className="absolute right-0 top-12 z-40 w-44 rounded-[18px] border border-slate-200 bg-white p-2 text-left shadow-xl">
                  <button
                    type="button"
                    onClick={() => selectCreateType("text")}
                    className="flex w-full items-center gap-2 rounded-[14px] px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
                  >
                    <HiOutlinePencilSquare className="text-lg" />
                    Text post
                  </button>
                  <button
                    type="button"
                    onClick={() => selectCreateType("image")}
                    className="flex w-full items-center gap-2 rounded-[14px] px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
                  >
                    <HiOutlinePhoto className="text-lg" />
                    Image
                  </button>
                  <button
                    type="button"
                    onClick={() => selectCreateType("voice")}
                    className="flex w-full items-center gap-2 rounded-[14px] px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
                  >
                    <HiOutlineMicrophone className="text-lg" />
                    Voice post
                  </button>
                  <button
                    type="button"
                    onClick={() => selectCreateType("video")}
                    className="flex w-full items-center gap-2 rounded-[14px] px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
                  >
                    <HiOutlinePlayCircle className="text-lg" />
                    Video
                  </button>
                </div>
              ) : null}
            </div>
            <AlertButton onClick={onAlertsClick} count={unreadCount} latestMessage={latestMessage} />
          </div>
        </div>
        {latestMessage ? (
          <div className="border-t border-slate-100 bg-sky-50 px-3 py-2 text-xs font-medium text-slate-700 sm:px-5">
            {latestMessage}
          </div>
        ) : null}
        {searchOpen && searchQuery.trim() ? (
          <div className="relative z-50 border-t border-slate-100 bg-white px-3 py-2 shadow-sm sm:px-5">
            <div className="max-h-72 space-y-2 overflow-y-auto">
              {!searchResults.length ? (
                <p className="rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-500">No matching Explore posts yet.</p>
              ) : null}

              {searchResults.map((post) => (
                <button
                  key={post.id}
                  type="button"
                  onClick={() => openSearchResult(post.id)}
                  className="block w-full rounded-2xl border border-slate-200 px-4 py-3 text-left transition hover:bg-slate-50"
                >
                  <p className="text-sm font-semibold text-slate-900">{post.author_name || "KunThai user"}</p>
                  <p className="mt-1 truncate text-sm text-slate-600">{post.body || "Media post"}</p>
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </header>

      <HeaderMenu open={menuOpen} onClose={() => setMenuOpen(false)} onNavigate={onNavigate} />
    </>
  );
}
