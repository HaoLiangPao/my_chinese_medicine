import { notFound } from "next/navigation";
import { getContext } from "@/lib/auth";

/** 管理员看板只给 platform_admins（docs/design/0015 §3.4）。别人看到「找不到这个页面」；统计函数自己还会再检查一次 */
export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  const { supabase } = await getContext();
  const { data: ok } = await supabase.rpc("is_platform_admin");
  if (ok !== true) notFound();
  return children;
}
