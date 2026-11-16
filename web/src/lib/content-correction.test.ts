import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  feedbackHref,
  fieldLabel,
  filterFeedback,
  groupBySubject,
  herbCorrectionFields,
  normalizeCorrection,
  parseCorrectionSubject,
  parseFeedbackFilter,
  statusLabel,
  type FeedbackRow,
} from "./content-correction";

const root = path.resolve(import.meta.dirname, "../../..");
const HERB = "3f2b8c1e-4a5d-4e6f-9a7b-0123456789ab";
const HERB2 = "11111111-2222-4333-8444-555555555555";

describe("「哪一项有误」的列表", () => {
  it("和 migration 的 check 约束一致（期望值照设计文档 0021 §3.2 的表写）", () => {
    const sql = readFileSync(path.join(root, "supabase/migrations/20261115000028_content_corrections.sql"), "utf8");
    const listAfter = (marker: string) => {
      const m = sql.match(new RegExp(`when '${marker}' then [^]*?field in \\(([^)]*)\\)`));
      return m ? [...m[1].matchAll(/'([a-z_]+)'/g)].map((x) => x[1]) : null;
    };
    const herb = [
      "name",
      "pinyin",
      "aliases",
      "category",
      "origin_kind",
      "medicinal_part",
      "base_herb",
      "properties",
      "monograph",
      "photo",
      "other",
    ];
    const quiz = ["stem", "options", "answer", "explanation", "source", "other"];
    expect(listAfter("herb")).toEqual(herb);
    expect(listAfter("quiz_question")).toEqual(quiz);
    expect(herbCorrectionFields({ hasMonograph: true, showsDefaultPhoto: true })).toEqual(herb);
  });

  it("药材页：没有资料不给选性味归经和其他资料；不是默认照片不给选照片", () => {
    expect(herbCorrectionFields({ hasMonograph: false, showsDefaultPhoto: true })).toEqual([
      "name",
      "pinyin",
      "aliases",
      "category",
      "origin_kind",
      "medicinal_part",
      "base_herb",
      "photo",
      "other",
    ]);
    const noPhoto = herbCorrectionFields({ hasMonograph: true, showsDefaultPhoto: false });
    expect(noPhoto).not.toContain("photo");
    expect(noPhoto).toContain("properties");
    expect(herbCorrectionFields({ hasMonograph: false, showsDefaultPhoto: false })).toHaveLength(8);
  });

  it("中文名", () => {
    expect(fieldLabel("herb", "properties")).toBe("性味归经");
    expect(fieldLabel("quiz_question", "answer")).toBe("答案");
    expect(fieldLabel("herb", "answer")).toBe("answer"); // 不配套的原样显示
    expect(fieldLabel(null, null)).toBe("—");
  });
});

describe("入口按钮 → 面板的对象", () => {
  it("格式对的照收，名字压成一行并截断，字段去重、只留这种对象有的", () => {
    expect(parseCorrectionSubject({ type: "herb", id: HERB, label: " 麻\n黄 ", fields: ["name", "answer", "name", "photo"] })).toEqual({
      type: "herb",
      id: HERB,
      label: "麻 黄",
      fields: ["name", "photo"],
    });
    expect(parseCorrectionSubject({ type: "quiz_question", id: "yinyang-001", label: "字".repeat(100) })?.label).toHaveLength(60);
    // 没给字段：这种对象的全部
    expect(parseCorrectionSubject({ type: "quiz_question", id: "yinyang-001", label: "x" })?.fields).toEqual([
      "stem",
      "options",
      "answer",
      "explanation",
      "source",
      "other",
    ]);
  });

  it("格式不对的不打开", () => {
    for (const bad of [
      null,
      "herb",
      { type: "formula", id: HERB },
      { type: "herb", id: "yinyang-001" },
      { type: "quiz_question", id: HERB },
      { type: "quiz_question", id: "YinYang-1" },
      { type: "herb", id: HERB, fields: ["answer"] }, // 一项都对不上
    ])
      expect(parseCorrectionSubject(bad)).toBeNull();
  });
});

describe("服务器端整理提交的内容", () => {
  const good = {
    subjectType: "herb",
    subjectId: HERB,
    field: "properties",
    description: "  应该是辛、微苦，温  ",
    evidence: " 《中国药典》\n2020 年版 ",
    pagePath: "/herbs/" + HERB + "?q=张三&x=13912345678",
  };

  it("对的：去掉首尾空格，依据压成一行，路径按 Bug 反馈的规则脱敏", () => {
    expect(normalizeCorrection(good)).toEqual({
      ok: true,
      value: {
        subjectType: "herb",
        subjectId: HERB,
        field: "properties",
        description: "应该是辛、微苦，温",
        evidence: "《中国药典》 2020 年版",
        pagePath: `/herbs/${HERB}?q&x`,
      },
    });
  });

  it("依据可以不写；描述截到 2000 字、依据截到 200 字", () => {
    const r = normalizeCorrection({ ...good, evidence: "   ", description: "字".repeat(2100) });
    expect(r.ok && r.value.evidence).toBeNull();
    expect(r.ok && r.value.description).toHaveLength(2000);
    const e = normalizeCorrection({ ...good, evidence: "书".repeat(300) });
    expect(e.ok && e.value.evidence).toHaveLength(200);
    expect(normalizeCorrection({ ...good, evidence: 42 }).ok && true).toBe(true);
  });

  it("不对的：对象、id、字段、描述", () => {
    const err = (raw: unknown) => {
      const r = normalizeCorrection(raw);
      return r.ok ? null : r.error;
    };
    expect(err(null)).toBe("不知道是哪味药 / 哪道题");
    expect(err({ ...good, subjectType: "formula" })).toBe("不知道是哪味药 / 哪道题");
    expect(err({ ...good, subjectId: "not-a-uuid" })).toBe("不知道是哪味药 / 哪道题");
    expect(err({ ...good, subjectType: "quiz_question" })).toBe("不知道是哪味药 / 哪道题"); // 题目 id 不是 uuid
    expect(err({ ...good, field: "answer" })).toBe("请选一下哪一项有误");
    expect(err({ ...good, field: "__proto__" })).toBe("请选一下哪一项有误");
    expect(err({ ...good, field: undefined })).toBe("请选一下哪一项有误");
    expect(err({ ...good, description: "   " })).toBe("请写一下应该是什么");
    expect(err({ ...good, description: ["x"] })).toBe("请写一下应该是什么");
    expect(err({ subjectType: "quiz_question", subjectId: "wuxing-012", field: "answer", description: "B" })).toBeNull();
  });

  it("路径没给：/", () => {
    const r = normalizeCorrection({ ...good, pagePath: undefined });
    expect(r.ok && r.value.pagePath).toBe("/");
  });
});

describe("管理员看板", () => {
  const row = (id: string, o: Partial<FeedbackRow>): FeedbackRow => ({
    id,
    created_at: "2026-11-15T01:00:00Z",
    status: "new",
    kind: "content",
    subject_type: "herb",
    subject_id: HERB,
    subject_label: "麻黄",
    ...o,
  });
  const rows: FeedbackRow[] = [
    row("b1", { kind: "bug", subject_type: null, subject_id: null, subject_label: null }),
    row("c1", { created_at: "2026-11-15T02:00:00Z" }),
    row("c2", { status: "fixed", created_at: "2026-11-15T03:00:00Z" }),
    row("c3", { subject_id: HERB2, subject_label: "黄芪", created_at: "2026-11-15T04:00:00Z" }),
    row("c4", { subject_type: "quiz_question", subject_id: "yinyang-001", subject_label: "阴阳题", status: "in_progress" }),
    row("c5", { subject_type: "quiz_question", subject_id: "yinyang-001", subject_label: "阴阳题", status: "wontfix" }),
    row("c6", { subject_id: null, subject_label: null }), // 药材删了
  ];

  it("状态的叫法：纠错说已改 / 不改", () => {
    expect(statusLabel("content", "fixed")).toBe("已改");
    expect(statusLabel("content", "wontfix")).toBe("不改");
    expect(statusLabel("bug", "fixed")).toBe("已修");
    expect(statusLabel(null, "new")).toBe("新");
    expect(statusLabel("bug", "weird")).toBe("weird");
  });

  it("按对象汇总：未处理多的在前，再按总数；删掉的不算", () => {
    expect(groupBySubject(rows).map((s) => [s.label, s.total, s.open])).toEqual([
      ["麻黄", 2, 1], // c1 新、c2 已改；和阴阳题一样多，最近一次（03:00）更晚
      ["阴阳题", 2, 1], // c4 处理中算未处理、c5 不改；总数 2 比黄芪多
      ["黄芪", 1, 1],
    ]);
    expect(groupBySubject(rows)[0]).toMatchObject({ key: `herb:${HERB}`, subjectType: "herb", lastAt: "2026-11-15T03:00:00Z" });
  });

  it("地址栏 ↔ 筛选", () => {
    expect(parseFeedbackFilter({ kind: "content", status: "fixed", subject: `herb:${HERB}` })).toEqual({
      kind: "content",
      status: "fixed",
      subject: `herb:${HERB}`,
    });
    expect(parseFeedbackFilter({ kind: "x", status: ["new"], subject: "herb:123" })).toEqual({ kind: null, status: null, subject: null });
    expect(parseFeedbackFilter({ subject: "quiz_question:yinyang-001" }).subject).toBe("quiz_question:yinyang-001");
    expect(feedbackHref({ kind: null, status: null, subject: null })).toBe("/admin/bugs");
    expect(feedbackHref({ kind: "bug", status: "new", subject: null })).toBe("/admin/bugs?kind=bug&status=new");
    // 按对象筛选时一定是纠错
    expect(feedbackHref({ kind: null, status: null, subject: `herb:${HERB}` })).toBe(`/admin/bugs?kind=content&subject=herb%3A${HERB}`);
  });

  it("筛选：类型、状态、对象", () => {
    const ids = (f: Parameters<typeof filterFeedback>[1]) => filterFeedback(rows, f).map((r) => r.id);
    expect(ids({ kind: "bug", status: null, subject: null })).toEqual(["b1"]);
    expect(ids({ kind: "content", status: "new", subject: null })).toEqual(["c1", "c3", "c6"]);
    expect(ids({ kind: "content", status: null, subject: `herb:${HERB}` })).toEqual(["c1", "c2"]);
    expect(ids({ kind: null, status: null, subject: null })).toHaveLength(7);
  });
});
