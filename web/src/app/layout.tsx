import type { Metadata, Viewport } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "药柜",
  description: "家庭中药方与药材库存记录",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1 };

const NAV = [
  { href: "/", label: "总览" },
  { href: "/prescriptions", label: "药方" },
  { href: "/inventory", label: "药柜" },
  { href: "/purchases", label: "采购" },
  { href: "/prices", label: "比价" },
  { href: "/herbs", label: "药材" },
  { href: "/learn", label: "学堂" },
];

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="zh-CN" className="h-full antialiased">
      <body className="min-h-full">
        <header className="sticky top-0 z-10 border-b border-line bg-paper/90 backdrop-blur">
          <nav className="mx-auto flex max-w-4xl items-center gap-1 overflow-x-auto px-4 py-3">
            <Link href="/" className="mr-3 shrink-0 font-serif text-xl font-bold text-cinnabar">
              药柜
            </Link>
            {NAV.slice(1).map((n) => (
              <Link
                key={n.href}
                href={n.href}
                className="shrink-0 rounded-md px-3 py-1.5 text-sm hover:bg-card"
              >
                {n.label}
              </Link>
            ))}
          </nav>
        </header>
        <main className="mx-auto max-w-4xl px-4 py-6">{children}</main>
      </body>
    </html>
  );
}
