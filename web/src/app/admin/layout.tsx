import Link from "next/link";
import { Suspense } from "react";
import { requireAdmin } from "./admin";
import { AdminTabs } from "./tabs";

/**
 * 管理员看板只给 platform_admins（docs/design/0015 §3.4）。别人看到「找不到这个页面」；统计函数自己还会再检查一次。
 * 看板不用 App 的导航（药方、药柜……），换成自己的 tab：检查通过以后才输出 data-admin-root，把 App 的导航藏起来
 */
export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  await requireAdmin();
  return (
    <>
      {/* data-admin-root：globals.css 用它藏起 App 的导航（离开看板就恢复；不用 <style>，React 不会把提升到 head 的样式删掉） */}
      <div data-admin-root hidden />
      <header
        className="mb-5 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-line pb-3"
        data-testid="admin-header"
      >
        <Link href="/admin" className="font-serif text-xl font-bold text-cinnabar" data-bug-label="看板标题">
          平台管理
        </Link>
        <Suspense fallback={null}>
          <AdminTabs />
        </Suspense>
      </header>
      {children}
    </>
  );
}
