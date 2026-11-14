"use server";

import { getContext } from "@/lib/auth";
import { invalidateAll } from "@/lib/invalidate";
import { JAR_BUCKET, JAR_MAX_BYTES, isUuid, jarPhotoFolder, jarPhotoPath, sniffImage, staleJarFiles } from "@/lib/jar-photo";
import type { SupabaseClient } from "@supabase/supabase-js";

type Result = { error?: string };

/** 上传 / 换本罐照片（docs/design/0010 §3.5）：先传文件，再记到 pantry_settings，最后删掉这味药文件夹里的旧文件 */
export async function uploadJarPhoto(herbId: string, form: FormData): Promise<Result> {
  if (!isUuid(herbId)) return { error: "药材不对" };
  const photo = form.get("photo");
  if (!(photo instanceof Blob) || photo.size === 0) return { error: "没有收到照片" };
  if (photo.size > JAR_MAX_BYTES) return { error: "照片太大，换一张试试" };
  const bytes = new Uint8Array(await photo.arrayBuffer());
  const type = sniffImage(bytes);
  if (!type) return { error: "只能上传照片（JPEG / WebP）" };

  const { supabase, workspaceId } = await getContext();
  const path = jarPhotoPath(workspaceId, herbId, crypto.randomUUID(), type);
  const { error: upErr } = await supabase.storage
    .from(JAR_BUCKET)
    .upload(path, bytes, { contentType: type === "webp" ? "image/webp" : "image/jpeg" });
  if (upErr) return { error: `上传失败：${upErr.message}` };

  // 只写 photo_path：upsert 只更新给出的列，罐号、提醒线不受影响
  const { error } = await supabase.from("pantry_settings").upsert({ workspace_id: workspaceId, herb_id: herbId, photo_path: path });
  if (error) {
    await supabase.storage.from(JAR_BUCKET).remove([path]);
    return { error: `保存失败：${error.message}` };
  }
  await removeStaleFiles(supabase, workspaceId, herbId, path);
  invalidateAll();
  return {};
}

/** 删掉本罐照片：详情页回到默认照片 */
export async function deleteJarPhoto(herbId: string): Promise<Result> {
  if (!isUuid(herbId)) return { error: "药材不对" };
  const { supabase, workspaceId } = await getContext();
  const { error } = await supabase
    .from("pantry_settings")
    .update({ photo_path: null })
    .eq("workspace_id", workspaceId)
    .eq("herb_id", herbId);
  if (error) return { error: `删除失败：${error.message}` };
  await removeStaleFiles(supabase, workspaceId, herbId, null);
  invalidateAll();
  return {};
}

/**
 * 删掉这味药文件夹里除了现在用的以外的文件（旧照片、上传了但没存上的），参考 docs/design/0012 的「顺手清理」：
 * 用当前用户的权限，只动自己药柜的。失败只记日志，下次换照片时再清
 */
async function removeStaleFiles(supabase: SupabaseClient, workspaceId: string, herbId: string, keep: string | null) {
  const folder = jarPhotoFolder(workspaceId, herbId);
  const { data, error } = await supabase.storage.from(JAR_BUCKET).list(folder, { limit: 100 });
  if (error) return console.error("列出本罐照片失败", error.message);
  const stale = staleJarFiles(
    folder,
    (data ?? []).map((f) => f.name),
    keep,
  );
  if (!stale.length) return;
  const { error: rmErr } = await supabase.storage.from(JAR_BUCKET).remove(stale);
  if (rmErr) console.error("删除旧的本罐照片失败", rmErr.message);
}
