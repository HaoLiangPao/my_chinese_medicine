// 开方页的处方行操作（纯函数）：同一味药再加一次 = 更新那一行，不会出现两行。
import { round2 } from "./rx";

export type RxLine = { herbId: string; name: string; grams: number; prep: string | null; note: string | null };

export function upsertLine(lines: RxLine[], line: RxLine): RxLine[] {
  const i = lines.findIndex((l) => l.herbId === line.herbId);
  if (i === -1) return [...lines, line];
  const next = lines.slice();
  next[i] = line;
  return next;
}

export const removeLine = (lines: RxLine[], herbId: string) => lines.filter((l) => l.herbId !== herbId);

export function moveLine(lines: RxLine[], herbId: string, dir: -1 | 1): RxLine[] {
  const i = lines.findIndex((l) => l.herbId === herbId);
  const j = i + dir;
  if (i === -1 || j < 0 || j >= lines.length) return lines;
  const next = lines.slice();
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}

/** 校验：克数必须 > 0 且最多两位小数，不超过 500g（防止手滑多打一个 0）；至少一味药 */
export function validateLines(lines: RxLine[]): string | null {
  if (!lines.length) return "至少要有一味药";
  for (const l of lines) {
    if (!(l.grams > 0)) return `${l.name} 的克数不对`;
    if (l.grams > 500) return `${l.name} ${l.grams}g 太多了，请确认`;
    if (round2(l.grams) !== l.grams) return `${l.name} 的克数最多两位小数`;
  }
  return null;
}

/** 每副成本：有单价的药加起来；没单价的列出来 */
export function lineCosts(lines: RxLine[], pricePerGram: Map<string, number>) {
  return lines.map((l) => {
    const ppg = pricePerGram.get(l.herbId);
    return { name_zh: l.name, grams_per_dose: l.grams, cost_per_dose: ppg === undefined ? null : Math.round(l.grams * ppg * 1e4) / 1e4 };
  });
}

export const COMMON_GRAMS = [3, 6, 9, 10, 12, 15, 18, 20, 30];
