/**
 * Bug 反馈的 Slack 通知（docs/design/0014 §6）。
 * 没配置 SLACK_BUG_WEBHOOK_URL 就什么都不做；配置了，发一条只有「编号、页面路径、时间」的消息。
 * 描述不发：用户可能在里面写病人的姓名、电话，这些不应该离开数据库。看内容要去数据库里查这个编号。
 */

export type BugNotice = { id: string; pagePath: string; createdAt: string };

/** Slack 的文字里 & < > 要转义，不然路径里的 <!channel> 会真的 @ 所有人 */
const escapeSlack = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** 消息内容：只用这三样（一个个字段取，不展开整个对象）。描述、操作记录、错误、浏览器、提交人都不发 */
export function buildSlackMessage(n: BugNotice): { text: string } {
  return { text: [`🐞 新的问题反馈 ${n.id}`, `页面：${escapeSlack(n.pagePath)}`, `时间：${n.createdAt}`].join("\n") };
}

/** 只发到 https 地址；本机地址可以用 http（E2E 的假 webhook） */
export function isAllowedWebhook(url: string): boolean {
  try {
    const u = new URL(url);
    if (u.protocol === "https:") return true;
    return u.protocol === "http:" && (u.hostname === "localhost" || u.hostname === "127.0.0.1");
  } catch {
    return false;
  }
}

type Options = { webhookUrl?: string; fetchImpl?: typeof fetch; timeoutMs?: number };

/**
 * 发通知。返回有没有发出去（测试用）；任何失败都只记日志，不抛错——通知不能影响提交。
 * 日志里不打印 webhook 地址（它是密钥）。
 */
export async function notifyBugReport(notice: BugNotice, opts: Options = {}): Promise<boolean> {
  const url = opts.webhookUrl ?? process.env.SLACK_BUG_WEBHOOK_URL;
  if (!url) return false;
  if (!isAllowedWebhook(url)) {
    console.error("SLACK_BUG_WEBHOOK_URL 不是 https 地址，没有发送");
    return false;
  }
  try {
    const res = await (opts.fetchImpl ?? fetch)(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(buildSlackMessage(notice)),
      signal: AbortSignal.timeout(opts.timeoutMs ?? 5000),
    });
    if (!res.ok) {
      console.error("Bug 反馈的 Slack 通知失败", notice.id, res.status);
      return false;
    }
    return true;
  } catch (e) {
    console.error("Bug 反馈的 Slack 通知失败", notice.id, e instanceof Error ? e.name : "unknown");
    return false;
  }
}
