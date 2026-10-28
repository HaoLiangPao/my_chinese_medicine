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
  // 用不取整的每副成本去乘副数、去比较，只在最后取整到分（先取整再乘会放大误差，见 docs/design/0003 §2）
  let exact = 0;
  const missing: string[] = [];
  for (const r of rows) {
    if (r.cost_per_dose === null || r.cost_per_dose === undefined) missing.push(r.name_zh);
    else exact += Number(r.cost_per_dose);
  }
  const complete = missing.length === 0 && rows.length > 0;
  const clinicExact = pricePaid === null || pricePaid === "" || !(doses > 0) ? null : Number(pricePaid) / doses;
  const savingExact = complete && clinicExact !== null ? clinicExact - exact : null;
  const savingPct = savingExact !== null && clinicExact ? Math.round((savingExact / clinicExact) * 1000) / 10 : null;
  return {
    perDose: round2(exact),
    total: round2(exact * doses),
    missing,
    complete,
    clinicPerDose: clinicExact === null ? null : round2(clinicExact),
    savingPerDose: savingExact === null ? null : round2(savingExact),
    savingPct,
  };
}

/** 每克 → 每 100 克（显示用） */
export const per100g = (ppg: number | string | null | undefined) =>
  ppg === null || ppg === undefined || ppg === "" ? null : round2(Number(ppg) * 100);
