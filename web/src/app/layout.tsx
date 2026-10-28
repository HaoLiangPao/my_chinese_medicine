import type { Metadata, Viewport } from "next";
import { Nav } from "@/components/nav";
import "./globals.css";

export const metadata: Metadata = {
  title: "药柜",
  description: "家庭中药方与药材库存记录",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1 };


export default async function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="zh-CN" className="h-full antialiased">
      <body className="min-h-full">
        <header className="sticky top-0 z-10 border-b border-line bg-paper/90 backdrop-blur">
          {/* 不用 Suspense：流式渲染时占位导航和真实导航会短暂同时存在 */}
          <Nav />
        </header>
        <main className="mx-auto max-w-4xl px-4 py-6">{children}</main>
      </body>
    </html>
  );
}
