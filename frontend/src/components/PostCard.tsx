"use client";

import { useState } from "react";
import { api } from "@/lib/api";

interface Post {
  postId: string;
  userId: string;
  userName: string;
  caption: string;
  imageUrl: string;
  createdAt: string;
  likeCount: number;
  likedByMe: boolean;
}

interface Props {
  post: Post;
  showDelete?: boolean;
  onDeleted?: (postId: string) => void;
}

export default function PostCard({ post, showDelete, onDeleted }: Props) {
  const [liked, setLiked] = useState(post.likedByMe);
  const [likeCount, setLikeCount] = useState(post.likeCount);
  const [showFullImage, setShowFullImage] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const toggleLike = async () => {
    try {
      if (liked) {
        await api.delete(`/posts/${post.postId}/like`);
        setLiked(false);
        setLikeCount((c) => c - 1);
      } else {
        await api.put(`/posts/${post.postId}/like`);
        setLiked(true);
        setLikeCount((c) => c + 1);
      }
    } catch {}
  };

  const handleDelete = async () => {
    if (!confirm("この投稿を削除しますか？")) return;
    setDeleting(true);
    try {
      await api.delete(`/posts/${post.postId}`);
      onDeleted?.(post.postId);
    } catch {
      setDeleting(false);
    }
  };

  const formattedDate = new Date(post.createdAt).toLocaleDateString("ja-JP", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <>
      <article className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 overflow-hidden">
        <div className="px-4 py-3 flex items-center justify-between">
          <div>
            <span className="font-medium text-sm text-zinc-900 dark:text-zinc-50">
              {post.userName}
            </span>
            <span className="ml-2 text-xs text-zinc-400 dark:text-zinc-500">
              {formattedDate}
            </span>
          </div>
          {showDelete && (
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="text-xs text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 disabled:opacity-50"
            >
              {deleting ? "削除中..." : "削除"}
            </button>
          )}
        </div>

        <button
          onClick={() => setShowFullImage(true)}
          className="w-full"
        >
          <img
            src={post.imageUrl}
            alt={post.caption || "投稿画像"}
            className="w-full object-contain max-h-[32rem] bg-zinc-100 dark:bg-zinc-800"
            loading="lazy"
          />
        </button>

        <div className="px-4 py-3 space-y-2">
          <div className="flex items-center gap-3">
            <button onClick={toggleLike} className="flex items-center gap-1 group">
              <svg
                className={`w-5 h-5 transition-colors ${liked ? "fill-red-500 text-red-500" : "fill-none text-zinc-400 dark:text-zinc-500 group-hover:text-red-400"}`}
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z"
                />
              </svg>
              <span className="text-sm text-zinc-500 dark:text-zinc-400">
                {likeCount}
              </span>
            </button>
          </div>

          {post.caption && (
            <p className="text-sm text-zinc-700 dark:text-zinc-300">
              {post.caption}
            </p>
          )}
        </div>
      </article>

      {showFullImage && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
          onClick={() => setShowFullImage(false)}
        >
          <img
            src={post.imageUrl}
            alt={post.caption || "投稿画像"}
            className="max-w-full max-h-full object-contain"
          />
        </div>
      )}
    </>
  );
}
