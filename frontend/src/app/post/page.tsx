"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import Header from "@/components/Header";
import AuthGuard from "@/components/AuthGuard";
import { api } from "@/lib/api";
import { processImage, validateFile } from "@/lib/image";

export default function PostPage() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [caption, setCaption] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;

    const err = validateFile(f);
    if (err) {
      setError(err);
      return;
    }

    setFile(f);
    setError("");
    const url = URL.createObjectURL(f);
    setPreview(url);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) {
      setError("写真を選択してください");
      return;
    }

    setSubmitting(true);
    setError("");

    try {
      const { blob, contentType } = await processImage(file);

      const { uploadUrl, s3Key } = await api.post<{ uploadUrl: string; s3Key: string }>(
        "/uploads/presign",
        { contentType, fileSize: blob.size }
      );

      await fetch(uploadUrl, {
        method: "PUT",
        body: blob,
        headers: { "Content-Type": contentType },
      });

      await api.post("/posts", { s3Key, caption: caption.trim() });

      router.push("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "投稿に失敗しました");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthGuard>
      <div className="flex flex-col flex-1 bg-zinc-50 dark:bg-zinc-950">
        <Header />
        <main className="flex-1 max-w-lg mx-auto w-full px-4 py-8">
          <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-50 mb-6">
            新規投稿
          </h1>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <input
                ref={fileRef}
                type="file"
                accept="image/jpeg,image/png,image/heic,.heic"
                onChange={handleFileChange}
                style={{ display: "none" }}
              />
              {preview ? (
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  className="w-full rounded-xl overflow-hidden border border-zinc-200 dark:border-zinc-700"
                >
                  <img src={preview} alt="プレビュー" className="w-full object-contain max-h-96" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  className="w-full h-64 rounded-xl border-2 border-dashed border-zinc-300 dark:border-zinc-600 flex flex-col items-center justify-center text-zinc-400 dark:text-zinc-500 hover:border-zinc-400 dark:hover:border-zinc-500 transition-colors"
                >
                  <svg className="w-12 h-12 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4v16m8-8H4" />
                  </svg>
                  <span className="text-sm">写真を選択</span>
                </button>
              )}
            </div>

            <div>
              <textarea
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                placeholder="キャプションを入力（200文字以内）"
                maxLength={200}
                rows={3}
                className="w-full px-4 py-3 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-50 placeholder:text-zinc-400 dark:placeholder:text-zinc-500 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <p className="text-xs text-zinc-400 dark:text-zinc-500 text-right mt-1">
                {caption.length}/200
              </p>
            </div>

            {error && (
              <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
            )}

            <button
              type="submit"
              disabled={submitting || !file}
              className="w-full py-3 rounded-xl bg-blue-600 text-white font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {submitting ? "投稿中..." : "投稿する"}
            </button>
          </form>
        </main>
      </div>
    </AuthGuard>
  );
}
