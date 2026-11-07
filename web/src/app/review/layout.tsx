import { notFound } from "next/navigation";
import { getContext } from "@/lib/auth";

/** 核对页只给审核人（monograph_reviewers，docs/design/0010 §3.2）。别人看到「找不到这个页面」 */
export default async function ReviewLayout({ children }: LayoutProps<"/review">) {
  const { supabase } = await getContext();
  const { data: ok } = await supabase.rpc("is_monograph_reviewer");
  if (ok !== true) notFound();
  return children;
}
