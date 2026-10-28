// 假的 OpenRouter（OpenAI 兼容 chat/completions）：E2E 里照片识别不调用真实模型。
// POST /api/v1/chat/completions → 返回 next（可以用 POST /__next 改）
// POST /__next {fail: true} → 所有模型都失败；{failModels: ["a"]} → 只有这些模型失败（测 fallback）
// GET  /__requests  → 收到过的请求（测试里检查有没有带图片）
import http from "node:http";

const PORT = Number(process.env.MOCK_OPENROUTER_PORT ?? 54400);
const requests = [];
let next = {
  issued_on: "2026-10-20",
  dose_count: 5,
  patient_name: "Hao",
  instructions: "水煎服，日一剂",
  items: [
    { name: "北芪", grams: 15, special_prep: null },
    { name: "党参", grams: 12, special_prep: null },
    { name: "麦门冬", grams: 9, special_prep: null },
    { name: "砂仁", grams: 3, special_prep: "后下" },
    { name: "鸡血藤", grams: 15, special_prep: null },
  ],
  notes: "第 5 味字迹潦草，请核对",
};
let failAll = false;
let failModels = [];

const read = (req) =>
  new Promise((ok) => {
    let b = "";
    req.on("data", (c) => (b += c));
    req.on("end", () => ok(b));
  });

http
  .createServer(async (req, res) => {
    const send = (code, body) => {
      res.writeHead(code, { "content-type": "application/json" });
      res.end(JSON.stringify(body));
    };
    if (req.method === "GET" && req.url === "/__requests") return send(200, requests);
    if (req.method === "POST" && req.url === "/__reset") {
      failAll = false;
      failModels = [];
      return send(200, { ok: true });
    }
    if (req.method === "POST" && req.url === "/__next") {
      const body = JSON.parse(await read(req));
      if (body.fail) failAll = true;
      else if (body.failModels) failModels = body.failModels;
      else next = body;
      return send(200, { ok: true });
    }
    if (req.method === "POST" && req.url === "/api/v1/chat/completions") {
      const body = JSON.parse(await read(req));
      requests.push({
        model: body.model,
        hasImage: body.messages?.[0]?.content?.some((c) => c.type === "image_url" && c.image_url?.url?.length > 100),
        hasFormat: body.response_format?.type === "json_schema" && !!body.response_format.json_schema?.schema,
        auth: req.headers.authorization === "Bearer test-key",
      });
      if (failAll || failModels.includes(body.model)) {
        return send(429, { error: { code: 429, message: "Rate limit exceeded (mock)" } });
      }
      return send(200, {
        id: "gen-mock",
        object: "chat.completion",
        model: body.model,
        choices: [{ index: 0, finish_reason: "stop", message: { role: "assistant", content: "```json\n" + JSON.stringify(next) + "\n```" } }],
        usage: { prompt_tokens: 1000, completion_tokens: 200 },
      });
    }
    send(404, { error: "not found" });
  })
  .listen(PORT, "127.0.0.1", () => console.log(`mock openrouter on ${PORT}`));
