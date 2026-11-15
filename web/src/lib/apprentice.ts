/**
 * 中医小学徒（docs/design/0019）：随机动作、说话框台词。纯函数，同一个种子结果一样。
 *
 * 硬规则（CLAUDE.md「AI 只做转录和科普」）：台词只讲知识和学习感受，不说针对病人的用药建议，不说用量。
 * 台词只从确定的数据拼：分类、拼音、别名、炮制品和原药材、同类的药、**已审核**的药材资料；再加 apprentice-lines.ts 里手写的通用台词。
 */
import { guiJing, xingWei, type Monograph, type Toxicity } from "./herb-monograph";
import { GENERIC_LINES } from "./apprentice-lines";

/** 五个动作。以后加动作：这里加一行，再在 components/apprentice/scenes.tsx 里加一个场景组件（TypeScript 会提醒） */
export const APPRENTICE_ACTIONS = [
  { id: "read", label: "读书" },
  { id: "pound", label: "捣药" },
  { id: "weigh", label: "称药" },
  { id: "drawer", label: "翻药斗" },
  { id: "needle", label: "练针灸" },
] as const;
export type ApprenticeAction = (typeof APPRENTICE_ACTIONS)[number]["id"];

/** mulberry32：给一个 32 位整数种子，返回 [0, 1) 的伪随机数序列 */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 服务端每次渲染生成一个种子，传给客户端组件（客户端不再随机，避免 hydration 不一致） */
export const newSeed = () => Math.floor(Math.random() * 4294967296);

/** 0 … n-1 里挑一个；n = 0 返回 -1 */
export function pickIndex(seed: number, n: number): number {
  return n > 0 ? Math.floor(seededRandom(seed)() * n) : -1;
}

export function pickAction(seed: number): ApprenticeAction {
  return APPRENTICE_ACTIONS[pickIndex(seed, APPRENTICE_ACTIONS.length)].id;
}

export const actionLabel = (a: ApprenticeAction) => APPRENTICE_ACTIONS.find((x) => x.id === a)!.label;

/** 洗牌（Fisher–Yates），不改原数组 */
export function shuffle<T>(items: readonly T[], seed: number): T[] {
  const out = [...items];
  const r = seededRandom(seed);
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * 台词里不能出现的字眼：用量（克、g、钱、两、毫升……）、服法（服用、每日、一次）、针对病人的建议（患者、病人、需要、建议）。
 * 手写的台词整句检查；从数据拼出来的台词先去掉药名、拼音、别名再检查（金钱草、两面针、拼音里的 g 不算）。
 */
export const FORBIDDEN = [
  "克",
  "g",
  "钱",
  "两",
  "斤",
  "毫升",
  "ml",
  "服用",
  "服下",
  "内服",
  "煎服",
  "每日",
  "每天",
  "一次",
  "剂量",
  "用量",
  "患者",
  "病人",
  "病患",
  "需要",
  "建议",
  "应该吃",
  "可以吃",
];

export function forbiddenWords(line: string, allowed: readonly string[] = []): string[] {
  let s = line;
  // 长的先去掉：「金钱草」要整个去掉，不能先去掉「金钱」
  for (const a of [...allowed].filter(Boolean).sort((x, y) => y.length - x.length)) s = s.split(a).join("");
  const lower = s.toLowerCase();
  return FORBIDDEN.filter((w) => lower.includes(w.toLowerCase()));
}

const MIN_LINES = 3;

export type HerbFacts = {
  name: string;
  pinyin: string | null;
  category: string | null;
  aliases: string[];
  /** 炮制品：原药材的名字 */
  base: string | null;
  /** 原药材：挂在下面的炮制品 */
  variants: string[];
  /** 同一功效分类里的其他药（调用方已经去掉了自己） */
  sameCategory: string[];
  /** 页面上显示的那份资料（resolveMonograph 的结果）；草稿不用 */
  monograph: { data: Monograph; fromBase: boolean } | null;
};

/** 「书上写大黄有小毒」 */
const TOXIC_WORDS: Record<Exclude<Toxicity, "none">, string> = { minor: "有小毒", toxic: "有毒", severe: "有大毒" };

/** 按数据拼出来的台词（还没过滤禁用字眼）；单元测试用它检查模板和数据本身 */
export function composeHerbLines(f: HerbFacts): string[] {
  const n = f.name;
  const lines: string[] = [];
  if (f.pinyin) lines.push(`${n}，拼音 ${f.pinyin}。先把字认准，抓药才不会抓错。`);
  if (f.category) lines.push(`${n}归在${f.category}里，我在一类一类地背。`);
  if (f.category && f.sameCategory.length) lines.push(`我在背${f.category}：${[n, ...f.sameCategory.slice(0, 3)].join("、")}……`);
  if (f.aliases.length) lines.push(`${n}也写作${f.aliases.slice(0, 3).join("、")}。方子上看到别的写法，也要认得是它。`);
  if (f.base) lines.push(`${n}是${f.base}的炮制品。师父说炮制不同，用法也不同，抓药时要看清。`);
  if (f.variants.length) lines.push(`${n}还有${f.variants.slice(0, 4).join("、")}这些炮制品。师父说炮制不同，用法也不同，抓药时要看清。`);

  // 已审核、而且审核人没有标「有问题」的资料才用
  const m = f.monograph?.data.status === "reviewed" && !f.monograph.data.flag_note ? f.monograph : null;
  if (m) {
    const d = m.data;
    const who = m.fromBase && f.base ? f.base : n;
    if (m.fromBase && f.base) lines.push(`${n}还没有单独的资料，我先看原药材${f.base}的。`);
    lines.push(`${who}：${xingWei(d)}，归${guiJing(d)}。背下来了！`);
    lines.push(`书上记的${who}的传统用途：${d.traditional_use}。这是中医传统用法，我先背下来。`);
    if (d.source) lines.push(`原来${who}是${d.source}。`);
    if (d.regions) lines.push(`${who}的道地产区：${d.regions}。`);
    if (d.quality) lines.push(`挑${who}要看：${d.quality}。`);
    if (d.processing) lines.push(`${who}的炮制：${d.processing}。`);
    if (d.storage) lines.push(`${who}的保存：${d.storage}。`);
    if (d.toxicity && d.toxicity !== "none") lines.push(`书上写${who}${TOXIC_WORDS[d.toxicity]}，抓药、保存都要格外仔细核对。`);
  }

  return lines;
}

/** 药名、拼音、别名这些「允许出现禁用字」的词（金钱草、两面针、拼音里的 g） */
export const allowedTerms = (f: HerbFacts) => [f.name, f.pinyin ?? "", f.base ?? "", ...f.aliases, ...f.variants, ...f.sameCategory];

/** 一味药的全部台词（还没洗牌）：先按数据拼，再去掉含禁用字眼的；不到 3 句的用通用台词补到 3 句；什么都拼不出来时用全部通用台词 */
export function herbLines(f: HerbFacts): string[] {
  const n = f.name;
  const allowed = allowedTerms(f);
  const safe = composeHerbLines(f).filter((l) => forbiddenWords(l, allowed).length === 0);
  if (safe.length >= MIN_LINES) return safe;
  if (safe.length) return [...safe, ...GENERIC_LINES.slice(0, MIN_LINES - safe.length)];
  return [`${n}？目录里还没有它的资料，我得去问问师父。`, ...GENERIC_LINES].filter((l) => forbiddenWords(l, [n]).length === 0);
}

/** 药材目录页：通用台词，加一句目录有多少味 */
export function catalogLines(catalogSize: number): string[] {
  // 不说「药柜」：家庭账号的「药柜」是自己的库存（terms.ts），会以为自己有这么多味
  return [`目录里有 ${catalogSize} 味药，我一天认几味，慢慢来。`, ...GENERIC_LINES];
}

/** 说话框底部的小字 */
export const DISCLAIMER = "小学徒在学习，仅为中药知识，不作用药建议";
