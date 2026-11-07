/** 家庭和诊所各自的用语（docs/design/0008 §4.4） */
export type AccountKind = "household" | "clinic";

export type Terms = {
  /** 一张方子 */
  rx: string;
  /** 存药的地方 */
  stock: string;
  /** 买药 */
  purchase: string;
  /** 份数单位（几副 / 几剂） */
  dose: string;
};

const TERMS: Record<AccountKind, Terms> = {
  household: { rx: "药方", stock: "药柜", purchase: "采购", dose: "副" },
  clinic: { rx: "处方", stock: "库存", purchase: "进货", dose: "剂" },
};

export function termsFor(kind: AccountKind | null | undefined): Terms {
  return TERMS[kind === "clinic" ? "clinic" : "household"];
}

export const isAccountKind = (v: unknown): v is AccountKind => v === "household" || v === "clinic";
