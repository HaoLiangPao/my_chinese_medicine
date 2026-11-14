/**
 * 药材默认照片（docs/design/0010 §3.5）：炮制品回退到原药材、出处文字。
 * 图片在 web/public/herb-photos/<file>；元数据在 herb_photos 表（只有核对过的）。
 */

export type HerbPhoto = {
  herb_id: string;
  file: string;
  kind: "饮片" | "药材" | "植物";
  author: string | null;
  license: string;
  license_url: string | null;
  source_url: string;
  width: number | null;
  height: number | null;
};

/** 数据库约束同款：文件名只能是 <拼音>.webp，拼进地址前再查一次，防止路径穿越 */
const FILE = /^[a-z]+(-[a-z]+)*\.webp$/;

export const photoSrc = (file: string) => (FILE.test(file) ? `/herb-photos/${file}` : null);
/** 列表用的 96px 小图（scripts/fetch-herb-photos.mjs choose 生成） */
export const thumbSrc = (file: string) => (FILE.test(file) ? `/herb-photos/${file.replace(/\.webp$/, ".thumb.webp")}` : null);

/** 自己的照片优先；炮制品没有就用原药材的，并标出来 */
export function resolvePhoto(own: HerbPhoto | null, base: HerbPhoto | null): { photo: HerbPhoto; fromBase: boolean } | null {
  if (own && photoSrc(own.file)) return { photo: own, fromBase: false };
  if (base && photoSrc(base.file)) return { photo: base, fromBase: true };
  return null;
}

export const KIND_LABEL: Record<HerbPhoto["kind"], string> = { 饮片: "饮片", 药材: "药材", 植物: "原植物" };

/** 照片下面的一行说明：「原植物 · 图为原药材黄芪」 */
export function photoCaption(photo: HerbPhoto, fromBase: boolean, baseName: string | null): string {
  return [KIND_LABEL[photo.kind], fromBase && baseName ? `图为原药材${baseName}` : null].filter(Boolean).join(" · ");
}

/** 出处：「图：作者 · 授权 · Wikimedia Commons」。公有领域没有作者时不写作者 */
export function creditText(photo: Pick<HerbPhoto, "author" | "license">): string {
  const author = photo.author?.trim();
  return [author ? `图：${author}` : "图", photo.license, "Wikimedia Commons"].join(" · ");
}
