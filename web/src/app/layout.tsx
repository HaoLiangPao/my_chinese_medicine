import type { Metadata, Viewport } from "next";
import { BugReport } from "@/components/bug-report";
import { Nav } from "@/components/nav";
import { getOptionalContext } from "@/lib/auth";
import "./globals.css";

export const metadata: Metadata = {
  title: "药柜",
  description: "中药方、病人处方与药材库存记录",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1 };

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const ctx = await getOptionalContext();
  return (
    <html lang="zh-CN" className="h-full antialiased">
      <body className="min-h-full">
        <header className="sticky top-0 z-10 border-b border-line bg-paper/90 backdrop-blur" data-app-header>
          {/* 不用 Suspense：流式渲染时占位导航和真实导航会短暂同时存在 */}
          <Nav />
        </header>
        {/* 登录后右下角有「反馈问题」按钮（docs/design/0014）：底部多留一点空白，滚到底时最后一个按钮不会被它挡住 */}
        <main className={`mx-auto max-w-4xl px-4 pt-6 ${ctx ? "pb-24 print:pb-6" : "pb-6"}`}>{children}</main>
        {ctx && <BugReport userId={ctx.user.id} />}
      </body>
    </html>
  );
}
