// 五脏 + 五腑 → 五行（从 CORRESPONDENCE 推出来，保证两处一致）
import { CORRESPONDENCE, ELEMENTS, type Element } from "./wuxing";

export type Organ = "肝" | "胆" | "心" | "小肠" | "脾" | "胃" | "肺" | "大肠" | "肾" | "膀胱";
export type OrganInfo = { name: Organ; element: Element; kind: "脏" | "腑" };

export const ORGANS: OrganInfo[] = ELEMENTS.flatMap((e) => [
  { name: CORRESPONDENCE[e].zang as Organ, element: e, kind: "脏" as const },
  { name: CORRESPONDENCE[e].fu as Organ, element: e, kind: "腑" as const },
]);

export const organsOf = (e: Element) => ORGANS.filter((o) => o.element === e).map((o) => o.name);
