/**
 * 批次（docs/design/0010 §3.3）：一次进货里的一味药（purchase_items 的一行）就是一个批次。
 * 库存是流水账，不按批次记扣减；「在用 / 已用完」按先进先出推算。
 */

/** 建议用完：分装后 12 个月（没有分装日期就从购入日期算） */
export const BEST_BEFORE_MONTHS = 12;

/** 批号前缀：拼音每个字的首字母，大写。「mai dong」→ MD；没有拼音（用户自己加的药）→ X。和数据库的 lot_prefix() 一致 */
export function lotPrefix(pinyin: string | null): string {
  const p = (pinyin ?? "").trim().toLowerCase().split(/\s+/).filter(Boolean).map((s) => s[0]).join("").toUpperCase();
  return /^[A-Z]+$/.test(p) ? p : "X";
}

/** 「2026-11-08」+ 12 个月 →「2027-11」 */
export function bestBefore(packedOn: string | null, purchasedOn: string): string {
  const [y, m] = (packedOn ?? purchasedOn).split("-").map(Number);
  const total = y * 12 + (m - 1) + BEST_BEFORE_MONTHS;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, "0")}`;
}

export type Batch = { id: string; purchased_on: string; created_at: string; grams: number };

/**
 * 先进先出：最新的一批最后用完。从最新的往回累加克数，加到够当前库存为止，这些是「在用」，更早的是「已用完」。
 * unbatched：库存比所有批次加起来还多的部分（比如第一次盘点时家里原本就有的）。
 */
export function splitBatches<T extends Batch>(batches: T[], onHand: number): { inUse: T[]; usedUp: T[]; unbatched: number } {
  const newestFirst = [...batches].sort((a, b) => b.purchased_on.localeCompare(a.purchased_on) || b.created_at.localeCompare(a.created_at));
  const inUse: T[] = [];
  const usedUp: T[] = [];
  let need = Math.max(0, onHand);
  for (const b of newestFirst) {
    if (need > 0) {
      inUse.push(b);
      need -= Number(b.grams);
    } else usedUp.push(b);
  }
  return { inUse, usedUp, unbatched: Math.max(0, Math.round(need * 100) / 100) };
}

export type BatchInfo = { origin: string | null; supplier_lot: string | null; packed_on: string | null };

/**
 * 同一张单子里同一味药写了几行时合并成一行（数据库里一张单子一味药只有一行）。
 * 批次信息取填了的那行；几行都填了但不一样 → 返回 null（应该分成两次记）。
 */
export function mergeBatchInfo(a: BatchInfo, b: BatchInfo): BatchInfo | null {
  const out: BatchInfo = { origin: null, supplier_lot: null, packed_on: null };
  for (const k of ["origin", "supplier_lot", "packed_on"] as const) {
    if (a[k] && b[k] && a[k] !== b[k]) return null;
    out[k] = a[k] ?? b[k];
  }
  return out;
}
