// 家庭录方的「医生」下拉（RX-6，docs/design/0011）。表单字段：
//   prescriber_id  = 已有医生的 id / "" 不填 / NEW 新增
//   prescriber_new = 选「新增」时填的名字

export const NEW_PRESCRIBER = "new";

export type PrescriberChoice =
  { kind: "none" } | { kind: "existing"; id: string } | { kind: "new"; name: string } | { kind: "error"; message: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** 名字去掉首尾空格、中间连续空白合成一个（「李  医生」和「李 医生」算同一个） */
export const cleanPrescriberName = (s: string) => s.replace(/\s+/g, " ").trim();

export function parsePrescriberChoice(idField: unknown, newField: unknown): PrescriberChoice {
  const id = typeof idField === "string" ? idField.trim() : "";
  if (!id) return { kind: "none" };
  if (id === NEW_PRESCRIBER) {
    const name = cleanPrescriberName(typeof newField === "string" ? newField : "");
    if (!name) return { kind: "error", message: "请填写新医生的名字" };
    if (name.length > 100) return { kind: "error", message: "医生名字太长" };
    return { kind: "new", name };
  }
  if (!UUID.test(id)) return { kind: "error", message: "医生选择有误，请刷新页面重试" };
  return { kind: "existing", id };
}

/** 默认选上一次用的医生；那位医生已经不在列表里（比如换了药柜）就不填 */
export function defaultPrescriberId(prescribers: { id: string }[], lastUsedId: string | null): string {
  return lastUsedId && prescribers.some((p) => p.id === lastUsedId) ? lastUsedId : "";
}

/** 详情页显示的医生名字：有 prescriber_id 用医生记录，老药方用文字 */
export function prescriberLabel(rx: { prescriber: string | null; prescribers?: { name: string } | null }): string | null {
  return rx.prescribers?.name ?? (rx.prescriber?.trim() || null);
}
