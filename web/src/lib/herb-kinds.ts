/**
 * 药材的来源（植物 / 菌藻 / 动物 / 矿物 / 加工品）和入药部位（只有植物），docs/design/0018。
 * 数据库存英文代码（herbs.origin_kind / medicinal_part），这里是中文叫法、显示顺序和分组。纯函数。
 */
export const ORIGIN_KINDS = ["plant", "fungus", "animal", "mineral", "manufactured"] as const;
export type OriginKind = (typeof ORIGIN_KINDS)[number];

export const MEDICINAL_PARTS = ["root", "fruit_seed", "whole", "leaf", "flower", "bark", "stem", "resin_other"] as const;
export type MedicinalPart = (typeof MEDICINAL_PARTS)[number];

export const ORIGIN_LABELS: Record<OriginKind, string> = {
  plant: "植物",
  fungus: "菌藻",
  animal: "动物",
  mineral: "矿物",
  manufactured: "加工品",
};

export const PART_LABELS: Record<MedicinalPart, string> = {
  root: "根及根茎",
  fruit_seed: "果实种子",
  whole: "全草",
  leaf: "叶",
  flower: "花",
  bark: "皮",
  stem: "茎木",
  resin_other: "树脂及其他",
};

export const UNCLASSIFIED_LABEL = "未分类";

/** 一味药的来源和部位；origin 为空 = 未分类（用户自己加的药） */
export type HerbKind = { origin: OriginKind | null; part: MedicinalPart | null };

type KindColumns = { origin_kind: string | null; medicinal_part: string | null };

const isOrigin = (v: string | null): v is OriginKind => (ORIGIN_KINDS as readonly (string | null)[]).includes(v);
const isPart = (v: string | null): v is MedicinalPart => (MEDICINAL_PARTS as readonly (string | null)[]).includes(v);

function toKind(row: KindColumns | null): HerbKind | null {
  if (!row || !isOrigin(row.origin_kind)) return null;
  return { origin: row.origin_kind, part: row.origin_kind === "plant" && isPart(row.medicinal_part) ? row.medicinal_part : null };
}

/**
 * 这味药的来源和部位。自己有就用自己的（目录里的炮制品都存了自己的值，胆南星这种和原药材不一样的也在里面）；
 * 自己是空的、又是炮制品，就跟原药材（兜底：以后哪个 migration 加了炮制品却忘了填）。来源和部位一起取，不拆开拼。
 */
export function resolveHerbKind(own: KindColumns | null, base: KindColumns | null): HerbKind {
  return toKind(own) ?? toKind(base) ?? { origin: null, part: null };
}

/** 「植物 · 根及根茎」「动物」「未分类」 */
export function herbKindLabel(kind: HerbKind): string {
  if (!kind.origin) return UNCLASSIFIED_LABEL;
  return kind.part ? `${ORIGIN_LABELS[kind.origin]} · ${PART_LABELS[kind.part]}` : ORIGIN_LABELS[kind.origin];
}

/** 图标的名字：植物按部位，别的按来源，未分类单独一个 */
export type HerbKindIconName = OriginKind | MedicinalPart | "unclassified";

/** 按来源分组的一组：植物按部位拆开（一共 8 + 4 + 未分类 = 13 组） */
export type OriginGroup<T> = { key: HerbKindIconName; label: string; herbs: T[] };

const GROUP_ORDER: HerbKindIconName[] = [...MEDICINAL_PARTS, "fungus", "animal", "mineral", "manufactured", "unclassified"];

export function groupKey(kind: HerbKind): HerbKindIconName {
  if (!kind.origin) return "unclassified";
  return kind.origin === "plant" ? (kind.part ?? "unclassified") : kind.origin;
}

export function groupLabel(key: HerbKindIconName): string {
  if (key === "unclassified") return UNCLASSIFIED_LABEL;
  if (isPart(key)) return `${ORIGIN_LABELS.plant} · ${PART_LABELS[key]}`;
  return ORIGIN_LABELS[key as OriginKind];
}

/** 药材目录按来源分组（/herbs?by=origin）。没有药的组不出现；组内顺序不变（调用方先按拼音排好）。 */
export function groupByOrigin<T>(herbs: T[], kindOf: (h: T) => HerbKind): OriginGroup<T>[] {
  const groups = new Map<HerbKindIconName, T[]>();
  for (const h of herbs) {
    const k = groupKey(kindOf(h));
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(h);
  }
  return GROUP_ORDER.filter((k) => groups.has(k)).map((k) => ({ key: k, label: groupLabel(k), herbs: groups.get(k)! }));
}
