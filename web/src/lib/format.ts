export const SPECIAL_PREPS = ["先煎", "后下", "包煎", "另煎", "烊化", "冲服"] as const;

export function grams(n: number | string | null | undefined) {
  if (n === null || n === undefined || n === "") return "—";
  const v = Number(n);
  return `${Number.isInteger(v) ? v : v.toFixed(1)} g`;
}

export function money(n: number | string | null | undefined) {
  if (n === null || n === undefined || n === "") return "—";
  return `$${Number(n).toFixed(2)}`;
}

export function num(v: FormDataEntryValue | null): number | null {
  if (v === null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export function str(v: FormDataEntryValue | null): string | null {
  const s = typeof v === "string" ? v.trim() : "";
  return s === "" ? null : s;
}
