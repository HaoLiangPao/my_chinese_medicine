// 药方照片识别：OpenRouter（OpenAI 兼容接口），按顺序尝试多个模型。设计见 docs/design/0001 §4。
import { z } from "zod";
import { SPECIAL_PREPS } from "@/lib/format";

export const Parsed = z.object({
  issued_on: z.string().nullable().describe("开方日期 YYYY-MM-DD；看不清就 null"),
  dose_count: z.number().int().nullable().describe("剂数/副数，如「七剂」「x7」→ 7；没写就 null"),
  patient_name: z.string().nullable().describe("患者姓名，没有就 null"),
  instructions: z.string().nullable().describe("煎服法原文，没有就 null"),
  items: z.array(
    z.object({
      name: z.string().describe("药名，按方子上的写法，用简体中文"),
      grams: z.number().nullable().describe("每副克数；写「钱」的按 1 钱 = 3g 换算；看不清就 null"),
      special_prep: z.enum(SPECIAL_PREPS).nullable().describe("先煎/后下/包煎等脚注，没有就 null"),
    }),
  ),
  notes: z.string().nullable().describe("看不清或不确定的地方，简短说明；没有就 null"),
});
export type Parsed = z.infer<typeof Parsed>;

export const DEFAULT_MODELS = ["nvidia/nemotron-3.5-super-vl:free", "deepseek/deepseek-v4.1-flash"];

/** OPENROUTER_MODELS="a,b" → ["a","b"]；没配置就用默认（免费模型在前，DeepSeek 兜底） */
export function modelList(env: string | undefined): string[] {
  const list = (env ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  return list.length ? list : DEFAULT_MODELS;
}

/** 模型有时会把 JSON 包在 ```json 里，或前后多说几句；取第一个 { 到最后一个 } */
export function extractJson(text: string): unknown {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end < start) throw new Error("返回的不是 JSON");
  return JSON.parse(text.slice(start, end + 1));
}

/** 从 chat/completions 的响应体里取出并校验结构化结果 */
export function parseCompletion(body: unknown): Parsed {
  const content = (body as { choices?: { message?: { content?: unknown } }[] })?.choices?.[0]?.message?.content;
  if (typeof content !== "string" || !content.trim()) throw new Error("模型没有返回内容");
  const r = Parsed.safeParse(extractJson(content));
  if (!r.success) throw new Error(`结果格式不对：${r.error.issues[0]?.path.join(".") || "?"} ${r.error.issues[0]?.message ?? ""}`.trim());
  return r.data;
}

export type Attempt = { model: string; error: string };

/** 依次尝试每个模型，第一个成功的就返回；全失败时把每个模型的错误拼在一起抛出 */
export async function withFallback<T>(models: string[], call: (model: string) => Promise<T>): Promise<{ model: string; value: T; failed: Attempt[] }> {
  const failed: Attempt[] = [];
  for (const model of models) {
    try {
      return { model, value: await call(model), failed };
    } catch (e) {
      failed.push({ model, error: (e as Error).message });
    }
  }
  throw new Error(failed.map((f) => `${f.model}：${f.error}`).join("；") || "没有配置模型");
}

export const PROMPT = `这是一张中医药方（可能是手写或打印）。请把上面的内容转成结构化数据，只输出 JSON。
要求：
- 每一味药一条，按方子上的顺序；
- 克数是「每一副」的用量；
- 不要猜测看不清的字，宁可在 notes 里说明；
- 只转录，不要添加或评价任何药材。`;

const { $schema: _ignored, ...jsonSchema } = z.toJSONSchema(Parsed, { target: "draft-7" });

/** OpenRouter chat/completions 的请求体 */
export function buildRequest(model: string, mediaType: string, base64: string) {
  return {
    model,
    max_tokens: 4096,
    temperature: 0,
    messages: [
      {
        role: "user",
        content: [
          { type: "image_url", image_url: { url: `data:${mediaType};base64,${base64}` } },
          { type: "text", text: PROMPT },
        ],
      },
    ],
    response_format: { type: "json_schema", json_schema: { name: "prescription", strict: true, schema: jsonSchema } },
    provider: { require_parameters: true },
  };
}

/** 调一次模型；HTTP 错误、超时、格式不对都抛错，让 withFallback 换下一个 */
export async function callOpenRouter(opts: {
  baseUrl: string;
  apiKey: string;
  model: string;
  mediaType: string;
  base64: string;
  timeoutMs?: number;
}): Promise<Parsed> {
  const res = await fetch(`${opts.baseUrl.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: { authorization: `Bearer ${opts.apiKey}`, "content-type": "application/json", "x-title": "yaogui" },
    body: JSON.stringify(buildRequest(opts.model, opts.mediaType, opts.base64)),
    signal: AbortSignal.timeout(opts.timeoutMs ?? 60_000),
  });
  const text = await res.text();
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    throw new Error(`HTTP ${res.status}`);
  }
  // OpenRouter 有时 HTTP 200 但 body 里带 error
  const err = (body as { error?: { message?: string } })?.error;
  if (!res.ok || err) throw new Error(`HTTP ${res.status}${err?.message ? ` ${err.message}` : ""}`);
  return parseCompletion(body);
}
