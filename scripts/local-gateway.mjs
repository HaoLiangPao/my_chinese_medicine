// 本地 Supabase-lite 的网关：把 supabase-js 的请求按路径转给各个服务（相当于 Supabase 的 Kong）。
//   /auth/v1/*    → Supabase Auth (GoTrue)
//   /rest/v1/*    → PostgREST
//   /storage/v1/* → 极简本地存储（文件存在 .local/storage，只实现 App 用到的上传/删除/签名链接/下载）
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const PORT = Number(process.env.GATEWAY_PORT ?? 54321);
const AUTH = process.env.AUTH_URL ?? "http://127.0.0.1:9999";
const REST = process.env.REST_URL ?? "http://127.0.0.1:3001";
const STORAGE_DIR = process.env.STORAGE_DIR ?? ".local/storage";
const SECRET = process.env.JWT_SECRET ?? "local-signing-secret";

function proxy(req, res, target, stripPrefix) {
  const url = new URL(req.url.slice(stripPrefix.length) || "/", target);
  const headers = { ...req.headers, host: url.host };
  const up = http.request(url, { method: req.method, headers }, (r) => {
    res.writeHead(r.statusCode ?? 502, r.headers);
    r.pipe(res);
  });
  up.on("error", (e) => {
    res.writeHead(502, { "content-type": "application/json" });
    res.end(JSON.stringify({ message: `gateway: ${e.message}` }));
  });
  req.pipe(up);
}

const sign = (p) => crypto.createHmac("sha256", SECRET).update(p).digest("hex").slice(0, 32);
const json = (res, code, body) => {
  res.writeHead(code, { "content-type": "application/json", "access-control-allow-origin": "*" });
  res.end(JSON.stringify(body));
};
const readBody = (req) =>
  new Promise((ok) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => ok(Buffer.concat(chunks)));
  });

async function storage(req, res) {
  const u = new URL(req.url, "http://x");
  const p = u.pathname.replace(/^\/storage\/v1/, "");
  let m;
  if ((m = p.match(/^\/object\/sign\/([^/]+)\/(.+)$/)) && req.method === "POST") {
    const key = `${m[1]}/${decodeURIComponent(m[2])}`;
    return json(res, 200, { signedURL: `/object/sign/${key}?token=${sign(key)}` });
  }
  if ((m = p.match(/^\/object\/sign\/([^/]+)\/(.+)$/)) && req.method === "GET") {
    const key = `${m[1]}/${decodeURIComponent(m[2])}`;
    if (u.searchParams.get("token") !== sign(key)) return json(res, 400, { message: "bad token" });
    const file = path.join(STORAGE_DIR, key);
    if (!fs.existsSync(file)) return json(res, 404, { message: "not found" });
    res.writeHead(200, { "content-type": "image/jpeg" });
    return fs.createReadStream(file).pipe(res);
  }
  if ((m = p.match(/^\/object\/([^/]+)$/)) && req.method === "DELETE") {
    const { prefixes = [] } = JSON.parse((await readBody(req)).toString() || "{}");
    for (const k of prefixes) fs.rmSync(path.join(STORAGE_DIR, m[1], k), { force: true });
    return json(res, 200, prefixes.map((name) => ({ name })));
  }
  if ((m = p.match(/^\/object\/([^/]+)\/(.+)$/)) && (req.method === "POST" || req.method === "PUT")) {
    const key = `${m[1]}/${decodeURIComponent(m[2])}`;
    const file = path.join(STORAGE_DIR, key);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, await readBody(req));
    return json(res, 200, { Key: key, Id: crypto.randomUUID() });
  }
  return json(res, 501, { message: `local storage stub: ${req.method} ${p} not implemented` });
}

http
  .createServer((req, res) => {
    if (req.url.startsWith("/auth/v1")) return proxy(req, res, AUTH, "/auth/v1");
    if (req.url.startsWith("/rest/v1")) return proxy(req, res, REST, "/rest/v1");
    if (req.url.startsWith("/storage/v1")) return void storage(req, res);
    json(res, 404, { message: "unknown route" });
  })
  .listen(PORT, "127.0.0.1", () => console.log(`gateway on http://127.0.0.1:${PORT}`));
