"use client";

import { useRef, useState, useSyncExternalStore, useTransition } from "react";
import { JAR_MAX_BYTES, fitWithin } from "@/lib/jar-photo";
import { deleteJarPhoto, uploadJarPhoto } from "./jar-photo-actions";

const noopSubscribe = () => () => {};

/** 在浏览器里缩小、重新编码（去掉 EXIF 里的拍摄位置等信息）。Safari 不能编码 WebP，就用 JPEG */
async function shrink(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  const { width, height } = fitWithin(bitmap.width, bitmap.height);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  const encode = (type: string, q: number) => new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, q));
  for (const q of [0.82, 0.7, 0.55]) {
    let blob = await encode("image/webp", q);
    if (!blob || blob.type !== "image/webp") blob = await encode("image/jpeg", q);
    if (blob && blob.size <= JAR_MAX_BYTES) return blob;
  }
  throw new Error("照片太大");
}

/** 本罐照片的按钮：拍 / 换 / 删（docs/design/0010 §3.5）。只在自己药柜里用 */
export function JarPhotoControls({
  herbId,
  hasJarPhoto,
  emptyLabel = "📷 拍本罐照片",
}: {
  herbId: string;
  hasJarPhoto: boolean;
  /** 还没有本罐照片时按钮上的字（占位图下面用「拍一张上传」） */
  emptyLabel?: string;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const hydrated = useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );

  const onFile = (file: File) =>
    start(async () => {
      setMsg(null);
      let blob: Blob;
      try {
        blob = await shrink(file);
      } catch {
        setMsg("这张照片打不开，换一张试试（JPEG / PNG / WebP）");
        return;
      }
      const form = new FormData();
      form.set("photo", blob);
      const res = await uploadJarPhoto(herbId, form);
      if (res.error) setMsg(res.error);
      if (fileRef.current) fileRef.current.value = "";
    });

  const onDelete = () => {
    if (!window.confirm("删掉本罐照片？删了以后显示默认照片。")) return;
    start(async () => {
      setMsg(null);
      const res = await deleteJarPhoto(herbId);
      if (res.error) setMsg(res.error);
    });
  };

  return (
    <div className="flex flex-wrap items-center gap-2 text-sm" data-testid="jar-photo-controls">
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        data-testid="jar-photo-input"
        disabled={!hydrated || pending}
        onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
      />
      <button
        data-bug-label="拍本罐照片"
        type="button"
        className="btn-ghost"
        disabled={!hydrated || pending}
        onClick={() => fileRef.current?.click()}
      >
        {!hydrated ? "加载中…" : pending ? "处理中…" : hasJarPhoto ? "📷 换一张本罐照片" : emptyLabel}
      </button>
      {hasJarPhoto && (
        <button data-bug-label="删除本罐照片" type="button" className="btn-ghost" disabled={!hydrated || pending} onClick={onDelete}>
          删除本罐照片
        </button>
      )}
      {msg && (
        <p className="w-full text-cinnabar" role="alert">
          {msg}
        </p>
      )}
    </div>
  );
}
