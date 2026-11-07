import { byPinyin } from "./pinyin-order";

/**
 * 药材资料（docs/design/0010 §3.1）：显示用的格式、炮制品回退到原药材、核对页表单的解析和检查。
 * 数据库里有同样的约束（herb_monographs 的 check + review_herb_monograph），这里先在页面上提示。
 */

export const NATURES = ["寒", "凉", "平", "温", "热"].flatMap((n) => [n, `微${n}`, `大${n}`]);
export const FLAVORS = ["酸", "苦", "甘", "辛", "咸", "淡", "涩"].flatMap((f) => [f, `微${f}`]);
export const MERIDIANS = ["肺", "大肠", "胃", "脾", "心", "小肠", "膀胱", "肾", "心包", "三焦", "胆", "肝"];
export const TOXICITY = { none: "无毒", minor: "小毒", toxic: "有毒", severe: "大毒" } as const;
export type Toxicity = keyof typeof TOXICITY;
/** 不写用量：数字 + 克 / g / 钱 / 两 / mg */
export const DOSE = /\d+(\.\d+)?\s*(g|克|钱|两|mg|毫克)/i;

export type Monograph = {
  herb_id: string;
  latin_name: string | null;
  source: string | null;
  flavors: string[];
  nature: string;
  meridians: string[];
  traditional_use: string;
  processing: string | null;
  regions: string | null;
  quality: string | null;
  toxicity: Toxicity | null;
  cautions: string | null;
  storage: string | null;
  reference: string;
  check_note: string | null;
  flag_note: string | null;
  status: "draft" | "reviewed";
  reviewed_by: string | null;
  reviewed_at: string | null;
};

/** 核对页能改的字段（和 review_herb_monograph 的 p_content 一致） */
export const EDITABLE = [
  "latin_name", "source", "flavors", "nature", "meridians", "traditional_use",
  "processing", "regions", "quality", "toxicity", "cautions", "storage",
] as const;
export type MonographContent = Pick<Monograph, (typeof EDITABLE)[number]>;

/** 炮制品自己的资料空着时，从原药材继承的字段 */
export const INHERITED = ["latin_name", "source", "regions", "quality", "toxicity", "cautions", "storage"] as const;

/**
 * 页面上显示哪份资料：自己的优先；炮制品没有自己的就用原药材的。
 * 炮制品自己的资料只写了和原药材不同的字段，空着的字段（毒性、产区、保存……）用原药材的。
 * 用到了原药材的字段、而原药材还是草稿 → 整份按草稿显示（inheritsDraft），不能把没审核的内容标成审核过。
 */
export function resolveMonograph(
  own: Monograph | null,
  base: Monograph | null,
): { data: Monograph; fromBase: boolean; inheritsDraft: boolean } | null {
  if (!own) return base ? { data: base, fromBase: true, inheritsDraft: false } : null;
  if (!base) return { data: own, fromBase: false, inheritsDraft: false };
  const data: Monograph = { ...own };
  let used = false;
  for (const k of INHERITED) {
    if (own[k] == null && base[k] != null) {
      (data as Record<string, unknown>)[k] = base[k];
      used = true;
    }
  }
  const inheritsDraft = used && base.status === "draft";
  if (inheritsDraft) Object.assign(data, { status: "draft", reviewed_by: null, reviewed_at: null });
  return { data, fromBase: false, inheritsDraft };
}

/** 「甘、微苦，微寒」 */
export function xingWei(m: Pick<Monograph, "flavors" | "nature">) {
  return `${m.flavors.join("、")}，${m.nature}`;
}

/** 「心、肺、胃经」 */
export function guiJing(m: Pick<Monograph, "meridians">) {
  return `${m.meridians.join("、")}经`;
}

/** 「2026-11」 */
export function reviewedMonth(date: string | null) {
  return date ? date.slice(0, 7) : "";
}

const splitList = (v: FormDataEntryValue | null) =>
  String(v ?? "")
    .split(/[、，,\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);
const text = (v: FormDataEntryValue | null) => {
  const s = String(v ?? "").trim();
  return s === "" ? null : s;
};

/** 核对页表单 → 资料内容。味和归经用顿号、逗号或空格分开；归经可以带「经」字 */
export function parseMonographForm(form: FormData): MonographContent {
  const tox = text(form.get("toxicity"));
  return {
    latin_name: text(form.get("latin_name")),
    source: text(form.get("source")),
    flavors: splitList(form.get("flavors")),
    nature: String(form.get("nature") ?? "").trim(),
    meridians: splitList(form.get("meridians")).map((m) => m.replace(/经$/, "")),
    traditional_use: String(form.get("traditional_use") ?? "").trim(),
    processing: text(form.get("processing")),
    regions: text(form.get("regions")),
    quality: text(form.get("quality")),
    toxicity: tox && tox in TOXICITY ? (tox as Toxicity) : null,
    cautions: text(form.get("cautions")),
    storage: text(form.get("storage")),
  };
}

/** 和数据库一样的检查，返回第一条问题（没问题返回 null） */
export function checkMonograph(c: MonographContent): string | null {
  if (!NATURES.includes(c.nature)) return "「性」只能写 寒 / 凉 / 平 / 温 / 热，可以加「微」「大」";
  if (!c.flavors.length || c.flavors.some((f) => !FLAVORS.includes(f))) return "「味」只能写 酸 / 苦 / 甘 / 辛 / 咸 / 淡 / 涩，可以加「微」";
  if (!c.meridians.length || c.meridians.some((m) => !MERIDIANS.includes(m))) return `「归经」只能写 ${MERIDIANS.join(" / ")}`;
  if (!c.traditional_use) return "请填写传统用途";
  if (DOSE.test(c.traditional_use) || DOSE.test(c.cautions ?? "")) return "药材资料里不写用量（传统用途、使用注意里不能有「数字 + 克」）";
  return null;
}

/** 审核完一味以后跳到哪：按顺序排在它后面的第一味待审核的药；后面没有了就从头找；一味都没有了返回 null */
export function nextPending<T extends { herb_id: string; name_zh: string; pinyin: string | null; status: string }>(all: T[], currentId: string) {
  const sorted = [...all].sort(byPinyin);
  const at = sorted.findIndex((m) => m.herb_id === currentId);
  const rotated = at < 0 ? sorted : [...sorted.slice(at + 1), ...sorted.slice(0, at)];
  return rotated.find((m) => m.status === "draft" && m.herb_id !== currentId)?.herb_id ?? null;
}
