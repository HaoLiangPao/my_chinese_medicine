/**
 * 本罐照片（LBL-8，docs/design/0010 §3.5）：路径、文件检查、浏览器里缩图的尺寸。
 * 私有 bucket jar-photos，路径 <药柜 id>/<药材 id>/<uuid>.webp|jpg；数据库约束和 storage 策略检查同样的格式。
 */

export const JAR_BUCKET = "jar-photos";
/** 浏览器里先缩到长边 1200px、重新编码（去掉 EXIF 里的位置等信息）。上传不超过 900KB：server action 的请求体默认上限是 1MB */
export const JAR_LONG_EDGE = 1200;
export const JAR_MAX_BYTES = 900 * 1024;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export const isUuid = (s: string) => UUID.test(s);

export type JarPhotoType = "webp" | "jpg";

export function jarPhotoPath(workspaceId: string, herbId: string, fileId: string, type: JarPhotoType): string {
  if (![workspaceId, herbId, fileId].every(isUuid)) throw new Error("路径里的 id 格式不对");
  return `${workspaceId}/${herbId}/${fileId}.${type}`;
}

/** 文件夹：同一药柜同一味药的照片都在这里（换照片后清理旧文件用） */
export const jarPhotoFolder = (workspaceId: string, herbId: string) => `${workspaceId}/${herbId}`;

/** 看文件头判断格式（不信浏览器报的类型）：WebP = RIFF....WEBP，JPEG = FF D8 FF */
export function sniffImage(bytes: Uint8Array): JarPhotoType | null {
  const ascii = (from: number, to: number) => String.fromCharCode(...bytes.slice(from, to));
  if (bytes.length >= 12 && ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return "webp";
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "jpg";
  return null;
}

/** 长边缩到 max 以内，不放大 */
export function fitWithin(width: number, height: number, max = JAR_LONG_EDGE): { width: number; height: number } {
  const scale = Math.min(1, max / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

/** 文件夹里除了现在用的以外都是没用的（换照片没删掉的旧文件、上传了但没存上的） */
export function staleJarFiles(folder: string, names: string[], keep: string | null): string[] {
  return names.map((n) => `${folder}/${n}`).filter((p) => p !== keep);
}
