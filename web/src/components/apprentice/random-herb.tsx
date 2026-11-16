"use client";

import { useSearchParams } from "next/navigation";
import { useFormStatus } from "react-dom";
import { openRandomHerb } from "./actions";

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn-ghost px-3 py-1.5" disabled={pending} data-bug-label="随便翻一味" data-testid="random-herb">
      {pending ? "小学徒在翻……" : label}
    </button>
  );
}

/**
 * 「随便翻一味」（docs/design/0019 §5）。目录页：可以勾「只翻我药柜里有的」；
 * 详情页「再翻一味」：沿用上一次的范围（地址里的 ?flip=mine），不翻到正在看的这味。
 */
export function RandomHerbForm({ stock, hasStock, currentHerbId }: { stock: string; hasStock?: boolean; currentHerbId?: string }) {
  const flip = useSearchParams().get("flip");
  if (currentHerbId)
    return (
      <form action={openRandomHerb} className="mt-2">
        <input type="hidden" name="current" value={currentHerbId} />
        {flip === "mine" && <input type="hidden" name="scope" value="mine" />}
        <Submit label={flip === "mine" ? `🎲 再翻一味（${stock}里的）` : "🎲 再翻一味"} />
      </form>
    );
  return (
    <form action={openRandomHerb} className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
      <Submit label="🎲 随便翻一味" />
      <label className="flex items-center gap-1 text-sm text-muted">
        <input
          type="checkbox"
          name="scope"
          value="mine"
          disabled={!hasStock}
          data-bug-label="只翻我药柜里有的"
          data-testid="random-herb-mine"
        />
        只翻{stock}里有的{!hasStock && `（${stock}里还没有药）`}
      </label>
    </form>
  );
}
