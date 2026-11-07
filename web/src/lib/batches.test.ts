import { describe, expect, it } from "vitest";
import { bestBefore, lotPrefix, mergeBatchInfo, splitBatches } from "./batches";

describe("lotPrefix", () => {
  it.each([
    ["mai dong", "MD"],
    ["huang qi", "HQ"],
    ["huang qin", "HQ"], // 黄芪、黄芩同为 HQ，序号在数据库里一起排
    ["nv zhen zi", "NZZ"],
    ["  Bai  Zhu ", "BZ"],
    [null, "X"],
    ["", "X"],
  ])("%s → %s", (p, want) => {
    expect(lotPrefix(p)).toBe(want);
  });
});

describe("bestBefore（分装后 12 个月）", () => {
  it("有分装日期用分装日期", () => {
    expect(bestBefore("2026-11-08", "2026-10-20")).toBe("2027-11");
  });
  it("没有分装日期用购入日期", () => {
    expect(bestBefore(null, "2026-10-20")).toBe("2027-10");
  });
  it("跨年：12 月 + 12 个月", () => {
    expect(bestBefore(null, "2026-12-31")).toBe("2027-12");
    expect(bestBefore("2026-01-01", "2025-12-01")).toBe("2027-01");
  });
});

describe("splitBatches（先进先出）", () => {
  const b = (id: string, purchased_on: string, grams: number, created_at = "2026-01-01T00:00:00Z") => ({ id, purchased_on, grams, created_at });
  const oct = b("oct", "2026-10-20", 300);
  const nov = b("nov", "2026-11-05", 227);

  it("库存比最新一批少 → 只有最新一批在用", () => {
    const r = splitBatches([oct, nov], 200);
    expect(r.inUse.map((x) => x.id)).toEqual(["nov"]);
    expect(r.usedUp.map((x) => x.id)).toEqual(["oct"]);
    expect(r.unbatched).toBe(0);
  });
  it("库存刚好等于最新一批 → 只有最新一批", () => {
    expect(splitBatches([oct, nov], 227).inUse.map((x) => x.id)).toEqual(["nov"]);
  });
  it("库存超过最新一批 → 往前一批也在用", () => {
    expect(splitBatches([oct, nov], 400).inUse.map((x) => x.id)).toEqual(["nov", "oct"]);
  });
  it("库存比所有批次加起来还多 → 多出来的是没有批次的（比如盘点时原本就有的）", () => {
    const r = splitBatches([oct, nov], 600);
    expect(r.inUse.map((x) => x.id)).toEqual(["nov", "oct"]);
    expect(r.unbatched).toBe(73);
  });
  it("库存 0 或负数 → 全部用完", () => {
    expect(splitBatches([oct, nov], 0).inUse).toEqual([]);
    expect(splitBatches([oct, nov], -5).usedUp.map((x) => x.id)).toEqual(["nov", "oct"]);
  });
  it("同一天两批：后记的算新", () => {
    const a = b("a", "2026-11-05", 100, "2026-11-05T01:00:00Z");
    const c = b("c", "2026-11-05", 100, "2026-11-05T02:00:00Z");
    expect(splitBatches([a, c], 50).inUse.map((x) => x.id)).toEqual(["c"]);
  });
  it("没有批次", () => {
    expect(splitBatches([], 120)).toEqual({ inUse: [], usedUp: [], unbatched: 120 });
  });
});

describe("mergeBatchInfo", () => {
  const none = { origin: null, supplier_lot: null, packed_on: null };
  it("取填了的那行", () => {
    expect(mergeBatchInfo(none, { origin: "浙江", supplier_lot: null, packed_on: "2026-11-01" })).toEqual({ origin: "浙江", supplier_lot: null, packed_on: "2026-11-01" });
  });
  it("一样的可以合并", () => {
    const x = { origin: "浙江", supplier_lot: "A1", packed_on: null };
    expect(mergeBatchInfo(x, x)).toEqual(x);
  });
  it("都填了但不一样 → null", () => {
    expect(mergeBatchInfo({ ...none, origin: "浙江" }, { ...none, origin: "四川" })).toBeNull();
  });
});
