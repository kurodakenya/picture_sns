"use client";

import Header from "@/components/Header";
import AuthGuard from "@/components/AuthGuard";

export default function Home() {
  return (
    <AuthGuard>
      <div className="flex flex-col flex-1 bg-zinc-50 dark:bg-zinc-950">
        <Header />
        <main className="flex-1 max-w-2xl mx-auto w-full px-4 py-8">
          <p className="text-center text-zinc-500 dark:text-zinc-400">
            まだ投稿はありません
          </p>
        </main>
      </div>
    </AuthGuard>
  );
}
