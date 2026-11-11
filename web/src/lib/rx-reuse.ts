/**
 * 基于已有药方开新处方（IDEA-3，docs/design/0013）。纯函数。
 * 「来源」是一个预设药方，或者一张以前的处方；给浏览器的处方来源**不带病人名字和电话**，只有病人 id（筛「当前病人的」用）。
 */
import type { RxLine } from "./rx-lines";

export type ReuseSource =
  | {
      kind: "template";
      id: string;
      name: string;
      lines: RxLine[];
      doses: number | null;
      instructions: string | null;
      notes: string | null;
      useCount: number;
      lastUsedAt: string | null;
    }
  | {
      kind: "prescription";
      id: string;
      date: string;
      patientId: string | null;
      lines: RxLine[];
      doses: number;
      instructions: string | null;
    };

export type ReuseScope = "templates" | "patient" | "all";

/** 「黄芪 30、白术 12、茯苓 15…（共 8 味）」 */
export function herbSummary(lines: Pick<RxLine, "name" | "grams">[], max = 5): string {
  const shown = lines.slice(0, max).map((l) => `${l.name} ${Number(l.grams)}`);
  return lines.length > max ? `${shown.join("、")}…（共 ${lines.length} 味）` : shown.join("、");
}

/** 列表上显示的名字：预设用名字；处方只用日期（不显示病人） */
export function sourceLabel(s: ReuseSource): string {
  return s.kind === "template" ? s.name : `${s.date} 的处方`;
}

/**
 * 按筛选和搜索词过滤：
 * - templates：预设，最近用过的在前（没用过的按名字）
 * - patient：当前病人的处方（没选病人就是空的），新的在前
 * - all：这个诊所所有处方，新的在前
 * 搜索词匹配预设名字或任何一味药的名字（「黄芪」找出含黄芪的）
 */
export function filterSources(sources: ReuseSource[], scope: ReuseScope, patientId: string | null, query: string): ReuseSource[] {
  const q = query.trim();
  const hit = (s: ReuseSource) => !q || (s.kind === "template" && s.name.includes(q)) || s.lines.some((l) => l.name.includes(q));
  if (scope === "templates") {
    return sources
      .filter((s): s is Extract<ReuseSource, { kind: "template" }> => s.kind === "template")
      .filter(hit)
      .sort((a, b) => (b.lastUsedAt ?? "").localeCompare(a.lastUsedAt ?? "") || a.name.localeCompare(b.name, "zh"));
  }
  return sources
    .filter((s): s is Extract<ReuseSource, { kind: "prescription" }> => s.kind === "prescription")
    .filter((s) => scope === "all" || (patientId !== null && s.patientId === patientId))
    .filter(hit)
    .sort((a, b) => b.date.localeCompare(a.date));
}

/**
 * 保存时提醒什么（设计 §3.2）：
 * - 照着处方开的 → 提醒「存成预设药方？」
 * - 照着预设开的 → 可以「同时更新这个预设」
 * - 什么都没照着 → 也可以存成预设，但不特别提醒
 */
export function presetPrompt(source: ReuseSource | null): "offer-save" | "offer-update" | "optional-save" {
  if (!source) return "optional-save";
  return source.kind === "prescription" ? "offer-save" : "offer-update";
}
