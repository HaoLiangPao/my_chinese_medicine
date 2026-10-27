import Link from "next/link";
import { Suspense } from "react";
import { getContext } from "@/lib/auth";
import { listHerbs } from "@/lib/herbs";
import { grams } from "@/lib/format";
import { Empty, Loading, PageHeader } from "@/components/ui";
import { adjustInventory, savePantrySettings } from "./actions";

export default function InventoryPage() {
  return (
    <>
      <PageHeader title="药柜" subtitle="家里每个罐子里还有多少克" action={{ href: "/purchases/new", label: "＋ 记采购" }} />
      <Suspense fallback={<Loading />}>
        <Inventory />
      </Suspense>
    </>
  );
}

async function Inventory() {
  const { supabase } = await getContext();
  const [{ data: rows, error }, herbs] = await Promise.all([
    supabase.from("v_inventory").select("*").order("name_zh"),
    listHerbs(supabase),
  ]);
  if (error) throw new Error(error.message);

  return (
    <div className="space-y-5">
      {!rows?.length ? (
        <Empty>药柜还是空的。记一笔采购，药材就会自动进到这里。</Empty>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {rows.map((r) => {
            const g = Number(r.on_hand_grams);
            const tone = g <= 0 ? "border-cinnabar" : r.is_low ? "border-amber" : "";
            return (
              <details key={r.herb_id} className={`card group ${tone}`} data-testid={`stock-card-${r.name_zh}`}>
                <summary className="cursor-pointer list-none">
                  <div className="flex items-baseline justify-between">
                    <span className="font-serif text-lg font-bold">{r.name_zh}</span>
                    {r.jar_label && <span className="text-xs text-muted">罐 {r.jar_label}</span>}
                  </div>
                  <div data-testid={`stock-${r.name_zh}`} className={`mt-1 text-2xl ${g <= 0 ? "text-cinnabar" : r.is_low ? "text-amber" : "text-jade"}`}>{grams(g)}</div>
                  <div className="text-xs text-muted">
                    {r.last_purchased_at ? `上次买 ${String(r.last_purchased_at).slice(0, 10)}` : "无采购记录"}
                  </div>
                </summary>
                <div className="mt-3 space-y-2 border-t border-line pt-3">
                  <form action={adjustInventory} className="flex gap-1">
                    <input type="hidden" name="herb_id" value={r.herb_id} />
                    <input name="actual" type="number" step="0.5" placeholder="称重后实际克数" aria-label={`${r.name_zh} 称重克数`} className="input" />
                    <button className="btn-ghost shrink-0 px-2">校准</button>
                  </form>
                  <form action={savePantrySettings} className="flex gap-1">
                    <input type="hidden" name="herb_id" value={r.herb_id} />
                    <input name="jar_label" defaultValue={r.jar_label ?? ""} placeholder="罐号" className="input w-16" />
                    <input name="low_stock_grams" type="number" defaultValue={r.low_stock_grams ?? ""} placeholder="低于多少克提醒" className="input" />
                    <button className="btn-ghost shrink-0 px-2">存</button>
                  </form>
                  <Link href={`/herbs/${r.herb_id}`} className="block text-xs text-muted underline">查看用量和购买记录 →</Link>
                </div>
              </details>
            );
          })}
        </div>
      )}

      <div className="card">
        <h2 className="mb-2 font-serif text-lg font-bold">盘点：家里原本就有的</h2>
        <p className="mb-3 text-sm text-muted">第一次用时，把家里已有的药材称一下录进来（不算采购，不影响单价统计）。</p>
        <form action={adjustInventory} className="grid grid-cols-[1fr_6rem_auto] gap-2">
          <datalist id="herb-names">
            {herbs.map((h) => (
              <option key={h.id} value={h.name_zh} />
            ))}
          </datalist>
          <input name="herb_name" list="herb-names" required placeholder="药名，如 麦冬" className="input" />
          <input name="actual" type="number" step="0.5" min={0} required placeholder="克" className="input" />
          <button className="btn-primary">录入</button>
        </form>
      </div>
    </div>
  );
}
