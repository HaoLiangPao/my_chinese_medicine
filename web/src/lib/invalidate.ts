import "server-only";
import { refresh, revalidatePath } from "next/cache";

/**
 * 任何写操作之后都刷新整个 App 的数据。
 * 这个 App 的页面互相依赖（药方 ↔ 库存 ↔ 统计 ↔ 总览），只刷新单个路径时，
 * Next.js 16 客户端保留的旧页面（Activity）可能显示过期数据——E2E 测过：删除药方后跳回列表还能看到它。
 */
export function invalidateAll() {
  revalidatePath("/", "layout");
  refresh();
}
