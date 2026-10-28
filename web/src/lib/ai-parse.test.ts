import { describe, expect, it } from "vitest";
import { buildRequest, DEFAULT_MODELS, extractJson, modelList, parseCompletion, withFallback } from "./ai-parse";

const ok = {
  issued_on: "2026-10-20",
  dose_count: 7,
  patient_name: null,
  instructions: null,
  items: [{ name: "黄芪", grams: 15, special_prep: null }],
  notes: null,
};
const completion = (content: unknown) => ({ choices: [{ message: { content } }] });

describe("modelList", () => {
  it("没配置 → 默认：免费模型在前，DeepSeek 兜底", () => {
    expect(modelList(undefined)).toEqual(DEFAULT_MODELS);
    expect(modelList(" , ")).toEqual(DEFAULT_MODELS);
    expect(DEFAULT_MODELS[0]).toMatch(/:free$/);
    expect(DEFAULT_MODELS[1]).toMatch(/^deepseek\//);
  });
  it("逗号分隔，去空格，保持顺序", () => {
    expect(modelList(" b/x , a/y ")).toEqual(["b/x", "a/y"]);
  });
});

describe("extractJson", () => {
  it("纯 JSON", () => expect(extractJson('{"a":1}')).toEqual({ a: 1 }));
  it("包在 ```json 里、前后有废话", () => expect(extractJson('好的：\n```json\n{"a":{"b":2}}\n```\n')).toEqual({ a: { b: 2 } }));
  it("没有 JSON → 抛错", () => expect(() => extractJson("看不清")).toThrow("不是 JSON"));
});

describe("parseCompletion", () => {
  it("合法结果", () => expect(parseCompletion(completion(JSON.stringify(ok)))).toEqual(ok));
  it("空内容 / 没有 choices → 抛错", () => {
    expect(() => parseCompletion(completion(""))).toThrow("没有返回内容");
    expect(() => parseCompletion({})).toThrow("没有返回内容");
  });
  it("不符合 schema（脚注不在列表里）→ 抛错并指出字段", () => {
    const bad = { ...ok, items: [{ name: "砂仁", grams: 3, special_prep: "后放" }] };
    expect(() => parseCompletion(completion(JSON.stringify(bad)))).toThrow(/items\.0\.special_prep/);
  });
  it("缺字段 → 抛错", () => {
    const { notes: _n, ...missing } = ok;
    expect(() => parseCompletion(completion(JSON.stringify(missing)))).toThrow(/notes/);
  });
});

describe("withFallback", () => {
  it("第一个成功就不再试后面的", async () => {
    const calls: string[] = [];
    const r = await withFallback(["a", "b"], async (m) => (calls.push(m), m.toUpperCase()));
    expect(r).toEqual({ model: "a", value: "A", failed: [] });
    expect(calls).toEqual(["a"]);
  });
  it("第一个失败 → 用第二个，并记下失败原因", async () => {
    const r = await withFallback(["free", "ds"], async (m) => {
      if (m === "free") throw new Error("HTTP 429");
      return 1;
    });
    expect(r).toEqual({ model: "ds", value: 1, failed: [{ model: "free", error: "HTTP 429" }] });
  });
  it("全失败 → 错误里列出每个模型", async () => {
    await expect(withFallback(["a", "b"], async (m) => Promise.reject(new Error(`${m} 坏了`)))).rejects.toThrow("a：a 坏了；b：b 坏了");
  });
  it("空列表 → 抛错", async () => {
    await expect(withFallback([], async () => 1)).rejects.toThrow("没有配置模型");
  });
});

describe("buildRequest", () => {
  const req = buildRequest("m", "image/png", "QUJD");
  it("图片用 data URL，要求结构化输出，只路由到支持的服务商", () => {
    expect(req.model).toBe("m");
    expect(req.messages[0].content[0]).toEqual({ type: "image_url", image_url: { url: "data:image/png;base64,QUJD" } });
    expect(req.response_format.type).toBe("json_schema");
    expect(req.response_format.json_schema.strict).toBe(true);
    expect(req.provider.require_parameters).toBe(true);
  });
  it("schema：所有字段必填（可为 null）、不允许多余字段、没有 $schema", () => {
    const s = req.response_format.json_schema.schema as Record<string, unknown>;
    expect(s.$schema).toBeUndefined();
    expect(s.additionalProperties).toBe(false);
    expect(s.required).toEqual(["issued_on", "dose_count", "patient_name", "instructions", "items", "notes"]);
  });
  it("prompt 只要求转录", () => {
    expect(req.messages[0].content[1]).toMatchObject({ type: "text", text: expect.stringContaining("只转录") });
  });
});
