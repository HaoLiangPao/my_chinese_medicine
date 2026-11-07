"use client";

import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";

/** 打印页上方的操作（只在屏幕上显示）：要不要印店名、打印 */
export function PrintControls({ showStore }: { showStore: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  // 先勾上，再换网址（等页面重新渲染完才勾上会显得点了没反应）。父组件用 key 在网址变了以后重置
  const [on, setOn] = useState(showStore);
  return (
    <div className="flex flex-wrap items-center gap-3">
      <label className="flex min-h-11 items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={on}
          onChange={(e) => {
            setOn(e.target.checked);
            router.replace(e.target.checked ? `${pathname}?store=1` : pathname);
          }}
          className="size-4 accent-cinnabar"
        />
        印上「购自」（店名）
      </label>
      <button type="button" onClick={() => window.print()} className="btn-primary min-h-11 px-6">
        打印
      </button>
    </div>
  );
}
