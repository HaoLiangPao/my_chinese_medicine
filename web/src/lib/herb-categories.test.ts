import { describe, expect, it } from "vitest";
import { groupByCategory } from "./herb-categories";

describe("groupByCategory", () => {
  const h = (name: string, category: string | null) => ({ name, category });

  it("按教材的分类顺序分组（不是按出现顺序、也不是按字），组内顺序不变", () => {
    const g = groupByCategory([h("黄芪", "补气药"), h("麻黄", "解表药"), h("人参", "补气药"), h("石膏", "清热药")]);
    expect(g.map((x) => x.category)).toEqual(["解表药", "清热药", "补气药"]);
    expect(g[2].herbs.map((x) => x.name)).toEqual(["黄芪", "人参"]);
  });

  it("没有分类、或者分类不认识的放在最后的「其他」", () => {
    const g = groupByCategory([h("茯神", null), h("麻黄", "解表药"), h("怪药", "不认识的分类")]);
    expect(g.map((x) => [x.category, x.herbs.map((y) => y.name)])).toEqual([
      ["解表药", ["麻黄"]],
      ["其他", ["茯神", "怪药"]],
    ]);
  });

  it("空列表 → 空", () => expect(groupByCategory([])).toEqual([]));
});
