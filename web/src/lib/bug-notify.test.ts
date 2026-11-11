import { afterEach, describe, expect, it, vi } from "vitest";
import { buildSlackMessage, isAllowedWebhook, notifyBugReport, SLACK_EXCERPT } from "./bug-notify";

const notice = {
  id: "3f2b8c1e-4a5d-4e6f-9a7b-0123456789ab",
  pagePath: "/clinic/prescribe?patient",
  description: "保存按钮点了没反应",
  createdAt: "2026-11-10T01:02:03.456Z",
};
const okFetch = () => vi.fn<typeof fetch>(async () => new Response("ok", { status: 200 }));

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("buildSlackMessage", () => {
  it("只有 id、路径、时间、描述", () => {
    expect(buildSlackMessage(notice)).toEqual({
      text: "🐞 新的问题反馈 3f2b8c1e-4a5d-4e6f-9a7b-0123456789ab\n页面：/clinic/prescribe?patient\n时间：2026-11-10T01:02:03.456Z\n描述：保存按钮点了没反应",
    });
  });
  it("描述只取前 100 字，电话和邮箱遮住", () => {
    const { text } = buildSlackMessage({ ...notice, description: "病人 4165550101 a@b.com 的处方" + "存".repeat(300) });
    const line = text.split("\n")[3];
    expect(line.startsWith("描述：病人 [数字] [邮箱] 的处方存")).toBe(true);
    expect(Array.from(line)).toHaveLength("描述：".length + SLACK_EXCERPT + 1); // 末尾一个 …
    expect(text).not.toContain("4165550101");
    expect(text).not.toContain("a@b.com");
  });
  it("先遮再截：第 100 个字附近的电话不会漏出一半", () => {
    const { text } = buildSlackMessage({ ...notice, description: "字".repeat(95) + "4165550101" });
    expect(text.split("\n")[3]).not.toMatch(/\d/);
  });
  it("多行描述压成一行；Slack 的特殊字符转义（<!channel> 不会真的 @ 所有人）", () => {
    const { text } = buildSlackMessage({ ...notice, description: "第一行\n\n第二行 <!channel> & <b>", pagePath: "/a?<x>" });
    expect(text.split("\n")).toHaveLength(4);
    expect(text).toContain("描述：第一行 第二行 &lt;!channel&gt; &amp; &lt;b&gt;");
    expect(text).toContain("页面：/a?&lt;x&gt;");
  });
});

describe("notifyBugReport", () => {
  it("没配置：不发任何请求", async () => {
    vi.stubEnv("SLACK_BUG_WEBHOOK_URL", "");
    const fetchImpl = okFetch();
    const globalFetch = vi.spyOn(globalThis, "fetch");
    expect(await notifyBugReport(notice, { fetchImpl })).toBe(false);
    expect(await notifyBugReport(notice)).toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(globalFetch).not.toHaveBeenCalled();
  });
  it("配置了：POST 一条 JSON，内容就是 buildSlackMessage，不含操作记录等别的字段", async () => {
    vi.stubEnv("SLACK_BUG_WEBHOOK_URL", "https://hooks.slack.com/services/T/B/x");
    const fetchImpl = okFetch();
    // 调用方就算多传了字段（操作记录、错误、提交人），消息里也没有
    const extra = {
      ...notice,
      recent_actions: [{ t: "", kind: "click", label: "点了秘密按钮" }],
      recent_errors: [{ message: "秘密错误", stack: "秘密堆栈" }],
      user_agent: "秘密浏览器",
      reporter_id: "秘密提交人",
    };
    expect(await notifyBugReport(extra, { fetchImpl })).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe("https://hooks.slack.com/services/T/B/x");
    expect(init?.method).toBe("POST");
    const body = JSON.parse(String(init?.body));
    expect(body).toEqual(buildSlackMessage(notice));
    expect(Object.keys(body)).toEqual(["text"]);
    expect(String(init?.body)).not.toContain("秘密");
  });
  it("http 的外部地址、乱写的地址不发；本机 http 可以（E2E 用）", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const fetchImpl = okFetch();
    expect(await notifyBugReport(notice, { webhookUrl: "http://hooks.example.com/x", fetchImpl })).toBe(false);
    expect(await notifyBugReport(notice, { webhookUrl: "不是地址", fetchImpl })).toBe(false);
    expect(await notifyBugReport(notice, { webhookUrl: "file:///etc/passwd", fetchImpl })).toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledTimes(3);
    expect(await notifyBugReport(notice, { webhookUrl: "http://127.0.0.1:54400/slack", fetchImpl })).toBe(true);
    expect(isAllowedWebhook("http://localhost.evil.com/x")).toBe(false);
  });
  it("发送失败不抛错，日志里没有 webhook 地址", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const webhookUrl = "https://hooks.slack.com/services/SECRET";
    const boom = vi.fn(async () => {
      throw new Error(`connect failed ${webhookUrl}`);
    });
    expect(await notifyBugReport(notice, { webhookUrl, fetchImpl: boom })).toBe(false);
    const bad = vi.fn(async () => new Response("no_service", { status: 404 }));
    expect(await notifyBugReport(notice, { webhookUrl, fetchImpl: bad })).toBe(false);
    expect(log).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(log.mock.calls)).not.toContain("SECRET");
  });
  it("超时不抛错", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const hang = vi.fn(
      (_url: Parameters<typeof fetch>[0], init?: RequestInit) =>
        new Promise<Response>((_ok, fail) => init?.signal?.addEventListener("abort", () => fail(init.signal!.reason))),
    );
    expect(await notifyBugReport(notice, { webhookUrl: "https://hooks.slack.com/x", fetchImpl: hang, timeoutMs: 20 })).toBe(false);
  });
});
