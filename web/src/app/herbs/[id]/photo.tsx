import Link from "next/link";
import { creditText, photoCaption, photoSrc, type HerbPhoto } from "@/lib/herb-photo";

/** 药材照片（docs/design/0010 §3.5、§4.1）：在最上面；没有照片时页面显示 NoPhoto 占位图。照片下写是饮片还是原植物，以及出处 */
export function HerbPhotoFigure({ photo, fromBase, baseName }: { photo: HerbPhoto; fromBase: boolean; baseName: string | null }) {
  const src = photoSrc(photo.file);
  if (!src) return null;
  return (
    <figure className="overflow-hidden rounded-lg border border-line bg-paper" data-testid="herb-photo">
      {/* 已经是缩好的 WebP（长边 800px），不走图片优化 */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={`${photoCaption(photo, fromBase, baseName)}照片`}
        width={photo.width ?? undefined}
        height={photo.height ?? undefined}
        className="mx-auto max-h-80 w-auto max-w-full object-contain"
      />
      <figcaption className="space-y-0.5 break-words border-t border-line px-3 py-2 text-xs text-muted">
        <p data-testid="herb-photo-caption">{photoCaption(photo, fromBase, baseName)}</p>
        <p data-testid="herb-photo-credit">
          <a href={photo.source_url} target="_blank" rel="noopener noreferrer" className="underline">
            {creditText(photo)}
          </a>
          {photo.license_url && (
            <>
              {" · "}
              <a href={photo.license_url} target="_blank" rel="noopener noreferrer" className="underline">
                授权条款
              </a>
            </>
          )}
          {" · "}
          <Link href="/herbs/photo-credits" className="underline">
            全部出处
          </Link>
        </p>
      </figcaption>
    </figure>
  );
}

/** 本罐照片：用户自己拍的，私有（签名链接一小时有效），只有本药柜的人看得到 */
export function JarPhotoFigure({ url }: { url: string }) {
  return (
    <figure className="overflow-hidden rounded-lg border border-line bg-paper" data-testid="jar-photo">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt="本罐照片" className="mx-auto max-h-80 w-auto max-w-full object-contain" />
      <figcaption className="border-t border-line px-3 py-2 text-xs text-muted">本罐照片 · 只有本药柜的人看得到</figcaption>
    </figure>
  );
}
