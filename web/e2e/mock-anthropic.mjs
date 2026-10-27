// 假的 Anthropic Messages API：E2E 里照片识别不调用真实模型。
// POST /v1/messages → 返回 MOCK_RESULT（可以用 POST /__next 改下一次的返回）
// GET  /__requests  → 收到过的请求（测试里检查有没有带图片）
import http from "node:http";

const PORT = Number(process.env.MOCK_ANTHROPIC_PORT ?? 54400);
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
let failRemaining = 0; // SDK 会自动重试，所以一次失败要连续返回多次

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
      failRemaining = 0;
      return send(200, { ok: true });
    }
    if (req.method === "POST" && req.url === "/__next") {
      const body = JSON.parse(await read(req));
      if (body.fail) failRemaining = 10;
      else next = body;
      return send(200, { ok: true });
    }
    if (req.method === "POST" && req.url.startsWith("/v1/messages")) {
      const body = JSON.parse(await read(req));
      requests.push({
        model: body.model,
        hasImage: body.messages?.[0]?.content?.some((c) => c.type === "image" && c.source?.data?.length > 100),
        hasFormat: !!body.output_config?.format,
      });
      if (failRemaining > 0) {
        failRemaining -= 1;
        return send(529, { type: "error", error: { type: "overloaded_error", message: "Overloaded (mock)" } });
      }
      return send(200, {
        id: "msg_mock",
        type: "message",
        role: "assistant",
        model: body.model,
        content: [{ type: "text", text: JSON.stringify(next) }],
        stop_reason: "end_turn",
        stop_sequence: null,
        usage: { input_tokens: 1000, output_tokens: 200 },
      });
    }
    send(404, { error: "not found" });
  })
  .listen(PORT, "127.0.0.1", () => console.log(`mock anthropic on ${PORT}`));
