// 发给病人的微信消息（纯文本）。格式见 docs/design/0006 §3。不含价格。

export type MessageItem = { name: string; grams: number | string; prep?: string | null; note?: string | null };
export type MessageInput = {
  clinicName: string;
  date: string; // YYYY-MM-DD
  patient: { name?: string | null; phone?: string | null };
  doses: number;
  items: MessageItem[];
  instructions?: string | null;
  advice?: string | null;
};

const SEP = "————————";
const fmtGrams = (g: number | string) => {
  const n = Number(g);
  return `${Number.isInteger(n) ? n : Number(n.toFixed(2))}g`;
};
const clean = (s?: string | null) => (s ?? "").replace(/\s+/g, " ").trim();

export function patientLabel(p: { name?: string | null; phone?: string | null }) {
  return clean(p.name) || clean(p.phone) || "（未填写）";
}

export function itemLine(it: MessageItem, i: number) {
  const extra = [clean(it.prep), clean(it.note)].filter(Boolean).join("；");
  return `${i + 1}. ${clean(it.name)} ${fmtGrams(it.grams)}${extra ? `（${extra}）` : ""}`;
}

export function formatWeChatMessage(m: MessageInput): string {
  const lines = [
    `【${clean(m.clinicName)}】处方`,
    `日期：${m.date}`,
    `患者：${patientLabel(m.patient)}`,
    `共 ${m.doses} 剂`,
    SEP,
    ...m.items.map(itemLine),
    SEP,
  ];
  if (clean(m.instructions)) lines.push(`煎服法：${clean(m.instructions)}`);
  if (clean(m.advice)) lines.push(`医嘱：${clean(m.advice)}`);
  return lines.join("\n");
}
