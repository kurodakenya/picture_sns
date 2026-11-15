"use client";

import piexif from "piexifjs";

export async function processImage(file: File): Promise<{ blob: Blob; contentType: string }> {
  let blob: Blob = file;
  let contentType = file.type;

  if (file.type === "image/heic" || file.name.toLowerCase().endsWith(".heic")) {
    const heic2any = (await import("heic2any")).default;
    const converted = await heic2any({ blob: file, toType: "image/jpeg", quality: 0.9 });
    blob = Array.isArray(converted) ? converted[0] : converted;
    contentType = "image/jpeg";
  }

  if (contentType === "image/jpeg") {
    blob = await removeExif(blob);
  }

  return { blob, contentType };
}

async function removeExif(blob: Blob): Promise<Blob> {
  const dataUrl = await blobToDataUrl(blob);
  try {
    const cleaned = piexif.remove(dataUrl);
    return dataUrlToBlob(cleaned);
  } catch {
    return blob;
  }
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

function dataUrlToBlob(dataUrl: string): Blob {
  const [header, base64] = dataUrl.split(",");
  const mime = header.match(/:(.*?);/)?.[1] || "image/jpeg";
  const bytes = atob(base64);
  const arr = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
  return new Blob([arr], { type: mime });
}

export function validateFile(file: File): string | null {
  const allowed = ["image/jpeg", "image/png", "image/heic"];
  const isHeic = file.name.toLowerCase().endsWith(".heic");
  if (!allowed.includes(file.type) && !isHeic) {
    return "JPEG、PNG、HEIC形式の画像を選択してください";
  }
  if (file.size > 10 * 1024 * 1024) {
    return "ファイルサイズは10MB以下にしてください";
  }
  return null;
}
