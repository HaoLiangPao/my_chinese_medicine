// 在浏览器里判断一个药名能不能对上药材目录，规则和数据库的 match_herb() 一样：
// 去掉首尾空格 → 先按标准名找 → 再按别名找。用来在录入时提示「不在目录里」，保存时以数据库为准。

export type HerbCatalog = { names: string[]; aliases: Record<string, string> }; // aliases: 别名 → 标准名

export type HerbMatch =
  | { kind: "empty" }
  | { kind: "name"; canonical: string }
  | { kind: "alias"; canonical: string } // 例如 北芪 → 黄芪
  | { kind: "unknown" }; // 保存时会新建这味药

export function buildMatcher(catalog: HerbCatalog): (raw: string) => HerbMatch {
  const names = new Set(catalog.names);
  return (raw) => {
    const name = raw.trim();
    if (!name) return { kind: "empty" };
    if (names.has(name)) return { kind: "name", canonical: name };
    const canonical = catalog.aliases[name];
    if (canonical) return { kind: "alias", canonical };
    return { kind: "unknown" };
  };
}
