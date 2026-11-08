import Link from "next/link";
import { bestBefore, splitBatches } from "@/lib/batches";
import { grams, money } from "@/lib/format";

export type BatchRow = {
  id: string;
  grams: number;
  price: number;
  origin: string | null;
  lot_no: string | null;
  supplier_lot: string | null;
  packed_on: string | null;
  purchased_on: string;
  created_at: string;
  store: string | null;
};

const per100 = (b: BatchRow) => `${money((Number(b.price) / Number(b.grams)) * 100)} / 100 g`;

/** 批次资料（docs/design/0010 §4.1）：在用的批次 + 历史批次；在用 / 已用完按先进先出推算 */
export function BatchesSection({ batches, onHand }: { batches: BatchRow[]; onHand: number }) {
  if (!batches.length) return null;
  const { inUse, usedUp, unbatched } = splitBatches(batches, onHand);
  return (
    <section className="card space-y-3" data-testid="batches">
      <h2 className="font-serif text-lg font-bold">批次资料</h2>
      {inUse.map((b) => (
        <div key={b.id} className="space-y-2 rounded-lg border border-line p-3" data-testid="batch-in-use">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="flex items-center gap-2">
              <span className="font-bold" data-testid="batch-lot">
                {b.lot_no}
              </span>
              <span className="rounded-full bg-jade px-2 py-0.5 text-xs text-white">在用</span>
            </span>
            <Link href={`/print/batch/${b.id}`} className="btn-ghost min-h-10 text-sm">
              打印批次标签
            </Link>
          </div>
          <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-sm sm:grid-cols-3">
            {(
              [
                ["产地", b.origin ?? "—"],
                ["购自", b.store ?? "—"],
                ["购入", b.purchased_on],
                ["净重", grams(b.grams)],
                ["单价", per100(b)],
                ["建议用完", bestBefore(b.packed_on, b.purchased_on)],
                ...(b.packed_on ? [["分装", b.packed_on]] : []),
                ...(b.supplier_lot ? [["供应商批号", b.supplier_lot]] : []),
              ] as [string, string][]
            ).map(([k, v]) => (
              <div key={k}>
                <dt className="text-xs text-muted">{k}</dt>
                <dd data-testid={`batch-${k}`}>{v}</dd>
              </div>
            ))}
          </dl>
        </div>
      ))}
      {unbatched > 0 && (
        <p className="text-sm text-muted" data-testid="batch-unbatched">
          另有 {grams(unbatched)} 没有进货记录（比如第一次盘点时原本就有的）。
        </p>
      )}
      {usedUp.length > 0 && (
        <ul className="divide-y divide-line text-sm" data-testid="batch-used-up">
          {usedUp.map((b) => (
            <li key={b.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-muted">
              <span>
                <span className="font-medium text-ink">{b.lot_no} · 已用完</span>
                <br />
                {[b.origin, b.store, b.purchased_on, grams(b.grams), per100(b)].filter(Boolean).join(" · ")}
              </span>
              <Link href={`/print/batch/${b.id}`} className="btn-ghost min-h-10 text-sm">
                打印批次标签
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
