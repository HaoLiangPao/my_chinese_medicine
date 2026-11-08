// 粘贴文字录入（RX-7）：把一段药方文字（比如医生发的微信消息）拆成表单字段。不调用模型。
// 认得的：CLN-5 生成的消息格式（rx-message.ts）和常见的手写格式：
//   黄芪 30g / 黄芪30克 / 黄芪：三十克 / 薄荷 3g（后下） / 一行几味「黄芪30g 白术12g，甘草6g」
//   日期：2026-11-07 / 2026年11月7日；患者：张三；共 7 剂 / 7副；煎服法：…；医嘱：…
// 认不出的行原样还给调用方，留在输入框里让用户自己改。

import { SPECIAL_PREPS } from "./format";

export type TextItem = { name: string; grams: number; prep: string | null; note: string | null };
export type ParsedText = {
  items: TextItem[];
  issued_on: string | null;
  dose_count: number | null;
  patient: string | null;
  instructions: string | null;
  advice: string | null;
  unrecognized: string[]; // 认不出的行（原样，不含空行）
};

const DIGIT: Record<string, number> = { 零: 0, 〇: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };

/** 中文数字（≤ 999，可以带「半」）→ 数字；阿拉伯数字照常。认不出返回 null */
export function parseNumber(raw: string): number | null {
  const s = raw.trim();
  if (/^\d+(\.\d+)?$/.test(s)) return Number(s);
  const m = /^([零〇一二两三四五六七八九十百]+)(半)?$|^(半)$/.exec(s);
  if (!m) return null;
  if (m[3]) return 0.5;
  let total = 0;
  let cur = 0;
  for (const ch of m[1]) {
    if (ch === "百") {
      total += (cur || 1) * 100;
      cur = 0;
    } else if (ch === "十") {
      total += (cur || 1) * 10;
      cur = 0;
    } else if (ch in DIGIT) {
      cur = DIGIT[ch];
    } else return null;
  }
  return total + cur + (m[2] ? 0.5 : 0);
}

const CN_NUM = "[零〇一二两三四五六七八九十百]+半?|半";
const NUM = String.raw`\d+(?:\.\d+)?|${CN_NUM}`;
// 一味药：药名（1–8 个汉字，取最短的）+ 可选冒号 + 克数（+ 单位）+ 可选括号脚注。
// 中文数字必须带「克」，不然「三七 3g」会被拆成「三」+ 七克
const HERB = new RegExp(
  String.raw`([\u4e00-\u9fff]{1,8}?)\s*[:：]?\s*(?:(\d+(?:\.\d+)?)\s*(g|G|克|公克)?|(${CN_NUM})\s*(?:克|公克))\s*(?:[（(]([^）)]*)[）)])?`,
  "gu",
);
const SEP_ONLY = /^[\s,，、;；。.]*$/;
const CN_DIGITS = /^[零〇一二两三四五六七八九十百]/;

const PREPS = new Set<string>(SPECIAL_PREPS);

/** 括号里的脚注：认得的煎法（后下、先煎……）放进 prep，其余原样（保留原来的标点）放进 note */
function splitFootnote(raw: string | undefined): { prep: string | null; note: string | null } {
  const text = (raw ?? "").trim();
  const prep = text.split(/[；;，,、\s]+/).find((p) => PREPS.has(p)) ?? null;
  // 只删作为一个整词出现的那个煎法（备注里也可能有同一个词，比如「不要先煎太久，先煎」）
  const token = prep ? new RegExp(String.raw`(^|[；;，,、\s])${prep}(?=[；;，,、\s]|$)`) : null;
  const rest = token ? text.replace(token, "$1").replace(/^[\s；;，,、]+|[\s；;，,、]+$/g, "").replace(/([；;，,、])[\s；;，,、]+/g, "$1") : text;
  return { prep, note: rest || null };
}

function toDate(s: string): string | null {
  // 整个值只能是日期（后面多了「星期六」之类就整行留着）
  const m = /^(\d{4})\s*[-/.年]\s*(\d{1,2})\s*[-/.月]\s*(\d{1,2})\s*日?$/.exec(s.trim());
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null; // 2 月 30 日之类
  return `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/**
 * 药名后面紧跟中文数字时，切法不止一种：「三七十克」可以是 三七 + 十克，也可以是 三 + 七十克。
 * 列出所有切法，选药名在目录里的那一种；不是正好一种就算认不出（整行留着），不悄悄猜。
 */
function splitCnHerb(name: string, num: string, isKnown?: (n: string) => boolean): { name: string; grams: number } | null {
  const options: { name: string; grams: number }[] = [];
  for (let k = 0; k < num.length; k++) {
    const g = parseNumber(num.slice(k));
    if (g !== null && g > 0 && name.length + k <= 8) options.push({ name: name + num.slice(0, k), grams: g });
  }
  if (options.length === 1) return options[0];
  const known = isKnown ? options.filter((o) => isKnown(o.name)) : [];
  return known.length === 1 ? known[0] : null;
}

/** 一行全是药（中间只有空格、逗号、顿号）才算药行；有一点认不出就整行留着 */
function parseHerbLine(line: string, isKnown?: (n: string) => boolean): TextItem[] | null {
  const items: TextItem[] = [];
  let last = 0;
  for (const m of line.matchAll(HERB)) {
    if (!SEP_ONLY.test(line.slice(last, m.index))) return null;
    let name = m[1];
    let grams: number | null;
    if (m[2] !== undefined) {
      grams = parseNumber(m[2]);
      // 没写单位的（「早晚各 1」「去白术 12」）只认目录里有的药名
      if (!m[3] && isKnown && !isKnown(name)) return null;
    } else {
      const split = CN_DIGITS.test(m[4]) ? splitCnHerb(name, m[4], isKnown) : { name, grams: parseNumber(m[4]) ?? 0 };
      if (!split) return null;
      ({ name, grams } = split);
    }
    if (grams === null || grams <= 0) return null;
    items.push({ name, grams, ...splitFootnote(m[5]) });
    last = m.index + m[0].length;
  }
  if (!items.length || !SEP_ONLY.test(line.slice(last))) return null;
  return items;
}

const join = (a: string | null, b: string) => (a ? `${a}；${b}` : b); // 同一栏出现几行就接起来，不丢

/** isKnown：药名在不在目录里（含别名）。用来拿不准的时候判断，不传就更保守 */
export function parseRxText(text: string, isKnown?: (name: string) => boolean): ParsedText {
  const out: ParsedText = { items: [], issued_on: null, dose_count: null, patient: null, instructions: null, advice: null, unrecognized: [] };
  for (const original of text.split(/\r?\n/)) {
    // 行首的序号：「1.」「1、」「(1)」「①」
    const line = original
      .trim()
      .replace(/^(?:\d+\s*[.、．)]|[（(]\d+[）)]|[①-⑳])\s*/, "")
      .trim();
    if (!line) continue;
    if (/^[—\-=_*·.\s]{3,}$/.test(line)) continue; // 分隔线
    if (/^【[^】]*】\s*处方$/.test(line)) continue; // CLN-5 的抬头（诊所名称不填进家庭药方）

    let m: RegExpExecArray | null;
    if ((m = /^(?:日期|开方日期)\s*[:：]\s*(.+)$/.exec(line))) {
      const d = toDate(m[1]);
      if (d) {
        out.issued_on = d;
        continue;
      }
    } else if ((m = /^(?:患者|病人|姓名)\s*[:：]\s*(.+)$/.exec(line))) {
      if (m[1].trim() !== "（未填写）") out.patient = m[1].trim();
      continue;
    } else if ((m = new RegExp(String.raw`^(?:共\s*)?(${NUM})\s*(?:剂|副|付|帖)$`, "u").exec(line))) {
      const n = parseNumber(m[1]);
      if (n && Number.isInteger(n)) {
        out.dose_count = n;
        continue;
      }
    } else if ((m = /^(?:煎服法|用法|服法)\s*[:：]\s*(.+)$/.exec(line))) {
      out.instructions = join(out.instructions, m[1].trim());
      continue;
    } else if ((m = /^(?:医嘱|备注)\s*[:：]\s*(.+)$/.exec(line))) {
      out.advice = join(out.advice, m[1].trim());
      continue;
    } else {
      const herbs = parseHerbLine(line, isKnown);
      if (herbs) {
        out.items.push(...herbs);
        continue;
      }
    }
    out.unrecognized.push(original.trim());
  }
  return out;
}
