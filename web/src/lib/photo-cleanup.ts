import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

export const PHOTO_BUCKET = "prescription-photos";

/** 上传的照片登记一下，以后没用上就能清理（docs/design/0012）。登记失败不影响识别，只记日志 */
export async function recordPhotoUpload(supabase: SupabaseClient, path: string, workspaceId: string) {
  const { error } = await supabase.from("photo_uploads").insert({ path, workspace_id: workspaceId });
  if (error) console.error("photo_uploads 登记失败", path, error.message);
}

/**
 * 删掉本药柜里超过 7 天、没挂到任何药方上的照片：先删 Storage 里的文件，再删登记。
 * 用当前用户的权限（RLS 只放行自己药柜的）。放在 after() 里调用，失败只记日志，下次再试。
 */
export async function cleanupStalePhotos(supabase: SupabaseClient) {
  const { data: paths, error } = await supabase.rpc("stale_photo_paths");
  if (error) return console.error("找不到要清理的照片", error.message);
  if (!paths?.length) return;
  const { error: rmErr } = await supabase.storage.from(PHOTO_BUCKET).remove(paths as string[]);
  if (rmErr) return console.error("删除照片失败", rmErr.message);
  const { error: delErr } = await supabase
    .from("photo_uploads")
    .delete()
    .in("path", paths as string[]);
  if (delErr) console.error("删除照片登记失败", delErr.message);
}
