// 煎药表单 → record_decoction 的 p_actual 参数（纯函数，单元测试覆盖）
import { round2 } from "./rx";

export type PlanItem = { herb_id: string; name: string; grams_per_dose: number };
export type ActualEntry = { herb_id: string; grams: number };
export type ExtraLine = { name: string; grams: number };

/** 处方量（每副 × 副数） */
export const plannedGrams = (item: PlanItem, doses: number) => round2(item.grams_per_dose * doses);

/**
 * 只把和处方不一样的药传给数据库（其余按处方量）。
 *   actualByHerb：用户在表单里填的「这次总共实际用量」，没填（undefined/空）= 按处方
 * 返回：{ overrides, invalid }，invalid 里是负数或非数字的输入
 */
export function buildOverrides(
  plan: PlanItem[],
  doses: number,
  actualByHerb: Record<string, number | string | undefined | null>,
): { overrides: ActualEntry[]; invalid: string[] } {
  const overrides: ActualEntry[] = [];
  const invalid: string[] = [];
  for (const p of plan) {
    const raw = actualByHerb[p.herb_id];
    if (raw === undefined || raw === null || raw === "") continue;
    const v = Number(raw);
    if (!Number.isFinite(v) || v < 0) {
      invalid.push(p.name);
      continue;
    }
    if (round2(v) !== plannedGrams(p, doses)) overrides.push({ herb_id: p.herb_id, grams: round2(v) });
  }
  return { overrides, invalid };
}

/** 处方外临时加的药：去掉空行，同名合并，克数必须 > 0 */
export function cleanExtras(extras: ExtraLine[]): ExtraLine[] {
  const m = new Map<string, number>();
  for (const e of extras) {
    const name = e.name.trim();
    const g = Number(e.grams);
    if (!name || !(g > 0)) continue;
    m.set(name, round2((m.get(name) ?? 0) + g));
  }
  return [...m.entries()].map(([name, grams]) => ({ name, grams }));
}

export type VarianceStatus = "exact" | "over" | "under" | "omitted" | "extra";
export function varianceStatus(planned: number, actual: number): VarianceStatus {
  if (planned === 0) return "extra";
  if (actual === 0) return "omitted";
  if (actual > planned) return "over";
  if (actual < planned) return "under";
  return "exact";
}
