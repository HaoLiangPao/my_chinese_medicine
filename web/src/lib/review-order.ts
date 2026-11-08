/**
 * 核对页的顺序（docs/design/0010 §3.2）。只在服务器端用：按拼音排要用到 pinyin-pro，
 * 不能放进 herb-monograph.ts（核对页的表单是客户端组件，会从那里引常量，拼音库会被打进浏览器端）。
 */
import { byPinyin } from "./pinyin-order";

/** 审核完一味以后跳到哪：按顺序排在它后面的第一味待审核的药；后面没有了就从头找；一味都没有了返回 null */
export function nextPending<T extends { herb_id: string; name_zh: string; pinyin: string | null; status: string }>(
  all: T[],
  currentId: string,
) {
  const sorted = [...all].sort(byPinyin);
  const at = sorted.findIndex((m) => m.herb_id === currentId);
  const rotated = at < 0 ? sorted : [...sorted.slice(at + 1), ...sorted.slice(0, at)];
  return rotated.find((m) => m.status === "draft" && m.herb_id !== currentId)?.herb_id ?? null;
}
