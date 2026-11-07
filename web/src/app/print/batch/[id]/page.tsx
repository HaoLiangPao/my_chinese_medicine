import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { getContext } from "@/lib/auth";
import { bestBefore } from "@/lib/batches";
import { grams } from "@/lib/format";
import { Loading } from "@/components/ui";
import { PrintControls } from "./print-controls";

/**
 * 批次标签（4 × 2 英寸，docs/design/0010 §4.3）：每次进货打印一张，贴在药材标签下面。
 * 「购自」默认不印（?store=1 才印）。打印时页面上只留标签本身。
 */
export default function BatchLabelPage({ params, searchParams }: PageProps<"/print/batch/[id]">) {
  return (
    <Suspense fallback={<Loading />}>
      <Label params={params} searchParams={searchParams} />
    </Suspense>
  );
}

type Row = {
  id: string;
  grams: number;
  origin: string | null;
  lot_no: string | null;
  supplier_lot: string | null;
  packed_on: string | null;
  herbs: { id: string; name_zh: string };
  purchases: { purchased_on: string; stores: { name: string } | null };
};

// @page 只在这个页面里出现：别的页面打印时不受影响
const PRINT_CSS = `
@page { size: 4in 2in; margin: 0; }
.batch-label { width: 4in; height: 2in; }
@media print {
  body * { visibility: hidden !important; }
  .batch-label, .batch-label * { visibility: visible !important; }
  .batch-label { position: fixed; left: 0; top: 0; border: 0 !important; border-radius: 0 !important; }
}`;

async function Label({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const showStore = sp.store === "1";
  const { supabase, workspaceId } = await getContext();
  const { data: b } = await supabase
    .from("purchase_items")
    .select("id, grams, origin, lot_no, supplier_lot, packed_on, herbs(id, name_zh), purchases!inner(purchased_on, workspace_id, stores(name))")
    .eq("id", id)
    .eq("purchases.workspace_id", workspaceId)
    .maybeSingle<Row>();
  if (!b) notFound();

  const cells: [string, string][] = [
    ["产地", b.origin ?? "—"],
    ["净重", grams(b.grams)],
    showStore ? ["购自", b.purchases.stores?.name ?? "—"] : ["供应商批号", b.supplier_lot ?? "—"],
    ["购入日期", b.purchases.purchased_on],
    ["分装日期", b.packed_on ?? "—"],
    ["建议用完", bestBefore(b.packed_on, b.purchases.purchased_on)],
  ];

  return (
    <div className="space-y-4">
      <style>{PRINT_CSS}</style>
      <Link href={`/herbs/${b.herbs.id}`} className="text-sm text-muted">← {b.herbs.name_zh}</Link>
      <h1 className="font-serif text-2xl font-bold">批次标签</h1>
      <PrintControls key={String(showStore)} showStore={showStore} />
      <p className="text-xs text-muted">标签纸 4 × 2 英寸。打印时选「实际大小 / 100%」、边距「无」。</p>

      {/* 标签按实际尺寸（4 英寸宽）显示；手机屏幕放不下时在这里横向滚动，不撑宽整个页面 */}
      <div className="overflow-x-auto pb-1">
        <div
          className="batch-label box-border flex flex-col gap-2.5 overflow-hidden rounded-md border border-line bg-white px-5 py-4 text-[12px] leading-snug text-black"
          data-testid="batch-label"
        >
          <div className="flex items-baseline justify-between gap-2">
            <span className="flex items-baseline gap-2.5">
              <span className="font-serif text-2xl font-black tracking-[3px]" data-testid="label-herb">{b.herbs.name_zh}</span>
              <span className="text-[11px] tracking-wider text-neutral-600">本批资料</span>
            </span>
            <span className="font-bold tracking-wide" data-testid="label-lot">批号 {b.lot_no}</span>
          </div>
          <div className="h-px bg-black" />
          <dl className="grid grid-cols-3 gap-x-3 gap-y-2">
            {cells.map(([k, v]) => (
              <div key={k} className="flex min-w-0 flex-col">
                <dt className="text-[11px] text-neutral-600">{k}</dt>
                <dd className="truncate font-medium" data-testid={`label-${k}`}>{v}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </div>
  );
}
