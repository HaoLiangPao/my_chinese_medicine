// MVP2 比价 / 成本的纯函数（单元测试覆盖）
import { round2 } from "./rx";

export type Strategy = { kind: "cheapest" } | { kind: "average" } | { kind: "store"; storeId: string };

/** URL 参数 ?cost=cheapest|average|store:<uuid> → Strategy；非法值回落到 cheapest */
export function parseStrategy(v: string | string[] | undefined): Strategy {
  const s = Array.isArray(v) ? v[0] : v;
  if (s === "average") return { kind: "average" };
  const m = s?.match(/^store:([0-9a-f-]{36})$/i);
  if (m) return { kind: "store", storeId: m[1] };
  return { kind: "cheapest" };
}

export const strategyParam = (s: Strategy) => (s.kind === "store" ? `store:${s.storeId}` : s.kind);

export type CostRow = { name_zh: string; grams_per_dose: number | string; cost_per_dose: number | string | null };

export type CostSummary = {
  perDose: number; // 有价格的药加起来的每副成本
  total: number; // × 副数
  missing: string[]; // 没有价格的药
  complete: boolean;
  clinicPerDose: number | null; // 在诊所实付 / 副数
  savingPerDose: number | null; // 诊所每副 - 自己买每副（正数 = 自己买更便宜）；不完整时为 null
  savingPct: number | null;
};

export function summarizeCost(rows: CostRow[], doses: number, pricePaid: number | string | null): CostSummary {
  let perDose = 0;
  const missing: string[] = [];
  for (const r of rows) {
    if (r.cost_per_dose === null || r.cost_per_dose === undefined) missing.push(r.name_zh);
    else perDose += Number(r.cost_per_dose);
  }
  perDose = round2(perDose);
  const complete = missing.length === 0 && rows.length > 0;
  const clinicPerDose = pricePaid === null || pricePaid === "" || !(doses > 0) ? null : round2(Number(pricePaid) / doses);
  const savingPerDose = complete && clinicPerDose !== null ? round2(clinicPerDose - perDose) : null;
  const savingPct =
    savingPerDose !== null && clinicPerDose ? Math.round((savingPerDose / clinicPerDose) * 1000) / 10 : null;
  return { perDose, total: round2(perDose * doses), missing, complete, clinicPerDose, savingPerDose, savingPct };
}

/** 每克 → 每 100 克（显示用） */
export const per100g = (ppg: number | string | null | undefined) =>
  ppg === null || ppg === undefined || ppg === "" ? null : round2(Number(ppg) * 100);

/** 同一味药在多家店的价格：返回最便宜的那家（价格 0 的赠品忽略；价格相同取店名靠前的） */
export function cheapest<T extends { store: string; ppg: number }>(offers: T[]): T | null {
  const valid = offers.filter((o) => o.ppg > 0).sort((a, b) => a.ppg - b.ppg || a.store.localeCompare(b.store));
  return valid[0] ?? null;
}
