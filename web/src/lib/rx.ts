// 药方相关的纯函数（无 I/O），方便单元测试。

export type RxLine = { name: string; grams: number; prep?: string | null; raw?: string | null };

/** 同一味药写了两次就合并克数（保留第一次出现的位置和脚注）。名字会去掉首尾空白。 */
export function mergeLines<T extends RxLine>(lines: T[]): T[] {
  const out = new Map<string, T>();
  for (const l of lines) {
    const name = l.name.trim();
    if (!name) continue;
    const prev = out.get(name);
    if (prev) prev.grams = round2(prev.grams + l.grams);
    else out.set(name, { ...l, name });
  }
  return [...out.values()];
}

/** 每副总克数 */
export const perDoseTotal = (lines: { grams: number | string }[]) =>
  round2(lines.reduce((s, l) => s + Number(l.grams), 0));

/**
 * 按现有库存最多能配几副：每味药 floor(库存 / 每副用量) 取最小。
 * 缺药或库存为负 → 0；空方 → 0。
 */
export function maxDosesFromStock(
  items: { herb_id: string; grams_per_dose: number | string }[],
  onHand: Map<string, number>,
): number {
  if (!items.length) return 0;
  let min = Infinity;
  for (const i of items) {
    const per = Number(i.grams_per_dose);
    if (!(per > 0)) continue;
    const have = onHand.get(i.herb_id) ?? 0;
    min = Math.min(min, Math.max(0, Math.floor((have + 1e-9) / per)));
  }
  return Number.isFinite(min) ? min : 0;
}

export const round2 = (n: number) => Math.round(n * 100) / 100;

// ---------------------------------------------------------------------------
// 单位换算
// 处方里的「钱/两」按现代处方习惯：1 钱 = 3 g，1 两 = 30 g（近似 31.25 g）。
// 买药时的「两/斤」是市制：1 斤 = 500 g，1 两 = 50 g。
// 两在两种场景里含义不同，所以必须指定 context。
// ---------------------------------------------------------------------------
export type Unit = "g" | "kg" | "钱" | "两" | "斤" | "lb" | "oz";
export type UnitContext = "prescription" | "market";

export function toGrams(amount: number, unit: Unit, context: UnitContext): number {
  if (!Number.isFinite(amount) || amount < 0) throw new Error(`无效的数量：${amount}`);
  const table: Record<UnitContext, Partial<Record<Unit, number>>> = {
    prescription: { g: 1, kg: 1000, 钱: 3, 两: 30 },
    market: { g: 1, kg: 1000, 两: 50, 斤: 500, lb: 453.59237, oz: 28.349523125 },
  };
  const f = table[context][unit];
  if (f === undefined) throw new Error(`「${unit}」不适用于${context === "prescription" ? "处方" : "采购"}`);
  return round2(amount * f);
}

/** 每克单价；克数为 0 返回 null */
export const pricePerGram = (price: number, grams: number) => (grams > 0 ? price / grams : null);
