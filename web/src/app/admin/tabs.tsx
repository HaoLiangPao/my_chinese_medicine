"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

const TABS = [
  { href: "/admin", label: "总览", range: true },
  { href: "/admin/bugs", label: "Bugs", range: false },
  { href: "/admin/doctors", label: "医生", range: true },
  { href: "/admin/patients", label: "病人", range: true },
];

/** 看板自己的导航。切换时带上选好的时间段（Bugs 不按时间段看） */
export function AdminTabs() {
  const path = usePathname();
  const sp = useSearchParams();
  const range = new URLSearchParams();
  for (const k of ["from", "to"]) {
    const v = sp.get(k);
    if (v) range.set(k, v);
  }
  const q = range.toString();
  return (
    <nav className="flex gap-1 overflow-x-auto" aria-label="看板" data-testid="admin-tabs">
      {TABS.map((t) => {
        const active = t.href === "/admin" ? path === "/admin" : path.startsWith(t.href);
        return (
          <Link
            key={t.href}
            href={t.range && q ? `${t.href}?${q}` : t.href}
            data-bug-label="看板切换页面"
            aria-current={active ? "page" : undefined}
            className={`shrink-0 rounded-md px-3 py-1.5 text-sm ${active ? "bg-cinnabar text-white" : "hover:bg-card"}`}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
