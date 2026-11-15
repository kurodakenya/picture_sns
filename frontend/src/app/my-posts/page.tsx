"use client";

import Header from "@/components/Header";
import AuthGuard from "@/components/AuthGuard";
import PostCard from "@/components/PostCard";
import { api } from "@/lib/api";
import { useState, useEffect, useCallback } from "react";

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

export default function MyPostsPage() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [nextCursor, setNextCursor] = useState<string | undefined>();
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  const fetchMyPosts = useCallback(async (cursor?: string) => {
    const url = cursor ? `/me/posts?cursor=${cursor}` : "/me/posts";
    return api.get<{ posts: Post[]; nextCursor?: string }>(url);
  }, []);

  useEffect(() => {
    fetchMyPosts()
      .then((data) => {
        setPosts(data.posts);
        setNextCursor(data.nextCursor);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [fetchMyPosts]);

  const loadMore = async () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const data = await fetchMyPosts(nextCursor);
      setPosts((prev) => [...prev, ...data.posts]);
      setNextCursor(data.nextCursor);
    } finally {
      setLoadingMore(false);
    }
  };

  const handleDeleted = (postId: string) => {
    setPosts((prev) => prev.filter((p) => p.postId !== postId));
  };

  return (
    <AuthGuard>
      <div className="flex flex-col flex-1 bg-zinc-50 dark:bg-zinc-950">
        <Header />
        <main className="flex-1 max-w-2xl mx-auto w-full px-4 py-8">
          <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-50 mb-6">
            マイ投稿
          </h1>

          {loading ? (
            <p className="text-center text-zinc-500 dark:text-zinc-400">
              読み込み中...
            </p>
          ) : posts.length === 0 ? (
            <p className="text-center text-zinc-500 dark:text-zinc-400">
              まだ投稿はありません
            </p>
          ) : (
            <div className="space-y-6">
              {posts.map((post) => (
                <PostCard
                  key={post.postId}
                  post={post}
                  showDelete
                  onDeleted={handleDeleted}
                />
              ))}
              {nextCursor && (
                <button
                  onClick={loadMore}
                  disabled={loadingMore}
                  className="w-full py-3 text-sm text-blue-600 dark:text-blue-400 hover:underline disabled:opacity-50"
                >
                  {loadingMore ? "読み込み中..." : "もっと見る"}
                </button>
              )}
            </div>
          )}
        </main>
      </div>
    </AuthGuard>
  );
}
