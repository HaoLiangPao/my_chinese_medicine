import { describe, expect, it } from "vitest";
import { filterSources, herbSummary, presetPrompt, sourceLabel, type ReuseSource } from "./rx-reuse";

const line = (name: string, grams: number) => ({ herbId: name, name, grams, prep: null, note: null });
const tpl = (id: string, name: string, lines: ReturnType<typeof line>[], lastUsedAt: string | null = null): ReuseSource => ({
  kind: "template",
  id,
  name,
  lines,
  doses: 7,
  instructions: null,
  notes: null,
  useCount: 0,
  lastUsedAt,
});
const rx = (id: string, date: string, patientId: string, lines: ReturnType<typeof line>[]): ReuseSource => ({
  kind: "prescription",
  id,
  date,
  patientId,
  lines,
  doses: 7,
  instructions: null,
});

const sources = [
  tpl("t1", "四君子汤加减", [line("党参", 15), line("白术", 12)], "2026-11-01T00:00:00Z"),
  tpl("t2", "补中益气汤", [line("黄芪", 30), line("白术", 10)], null),
  tpl("t3", "玉屏风散", [line("黄芪", 18), line("防风", 9)], "2026-11-05T00:00:00Z"),
  rx("r1", "2026-10-15", "p1", [line("黄芪", 30), line("当归", 6)]),
  rx("r2", "2026-11-02", "p2", [line("麦冬", 9)]),
  rx("r3", "2026-11-03", "p1", [line("白术", 12)]),
];
const ids = (list: ReuseSource[]) => list.map((s) => s.id);

describe("herbSummary", () => {
  it("少于等于 5 味全列", () => {
    expect(herbSummary([line("黄芪", 30), line("白术", 12.5)])).toBe("黄芪 30、白术 12.5");
  });
  it("多了只列前 5 味并写总数", () => {
    const many = ["黄芪", "白术", "茯苓", "甘草", "当归", "川芎", "白芍"].map((n) => line(n, 10));
    expect(herbSummary(many)).toBe("黄芪 10、白术 10、茯苓 10、甘草 10、当归 10…（共 7 味）");
  });
});

describe("sourceLabel：处方只显示日期，不显示病人", () => {
  it("预设用名字；处方用日期", () => {
    expect(sourceLabel(sources[0])).toBe("四君子汤加减");
    expect(sourceLabel(sources[3])).toBe("2026-10-15 的处方");
  });
});

describe("filterSources", () => {
  it("预设：最近用过的在前，没用过的放后面", () => {
    expect(ids(filterSources(sources, "templates", null, ""))).toEqual(["t3", "t1", "t2"]);
  });
  it("当前病人的：只有这个病人的，新的在前；没选病人就是空的", () => {
    expect(ids(filterSources(sources, "patient", "p1", ""))).toEqual(["r3", "r1"]);
    expect(filterSources(sources, "patient", null, "")).toEqual([]);
  });
  it("全部：所有处方，新的在前", () => {
    expect(ids(filterSources(sources, "all", null, ""))).toEqual(["r3", "r2", "r1"]);
  });
  it("按药材名搜；预设也能按名字搜", () => {
    expect(ids(filterSources(sources, "all", null, "黄芪"))).toEqual(["r1"]);
    expect(ids(filterSources(sources, "templates", null, "黄芪"))).toEqual(["t3", "t2"]);
    expect(ids(filterSources(sources, "templates", null, "四君子"))).toEqual(["t1"]);
  });
});

describe("presetPrompt", () => {
  it("照着处方 → 提醒存预设；照着预设 → 可以更新预设；没照着 → 可选", () => {
    expect(presetPrompt(sources[3])).toBe("offer-save");
    expect(presetPrompt(sources[0])).toBe("offer-update");
    expect(presetPrompt(null)).toBe("optional-save");
  });
});
