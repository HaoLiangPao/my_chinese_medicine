import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { RxLine } from "@/lib/rx-lines";
import type { ReuseSource } from "@/lib/rx-reuse";

/** 「全部处方」只列最近这么多张（当前病人的、照着开的那张不受限制） */
export const RECENT_LIMIT = 200;

type ItemRow = {
  herb_id: string;
  grams_per_dose: number;
  special_prep: string | null;
  note: string | null;
  sort_order: number;
  herbs: { name_zh: string } | null;
};
type TemplateRow = {
  id: string;
  name: string;
  dose_count: number | null;
  instructions: string | null;
  notes: string | null;
  use_count: number;
  last_used_at: string | null;
  prescription_template_items: ItemRow[];
};
type RxRow = {
  id: string;
  issued_on: string;
  patient_id: string | null;
  dose_count: number;
  instructions: string | null;
  prescription_items: ItemRow[];
};

const ITEMS = "herb_id, grams_per_dose, special_prep, note, sort_order, herbs(name_zh)";
// 处方**不取标题、病人名字、电话、医嘱**：诊所处方的标题是「病人 + 日期」（docs/design/0013 §1）
const RX_COLUMNS = `id, issued_on, patient_id, dose_count, instructions, prescription_items(${ITEMS})`;

const toLines = (items: ItemRow[]): RxLine[] =>
  [...items]
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((i) => ({
      herbId: i.herb_id,
      name: i.herbs?.name_zh ?? "?",
      grams: Number(i.grams_per_dose),
      prep: i.special_prep,
      note: i.note,
    }));

const fromRx = (r: RxRow): ReuseSource => ({
  kind: "prescription",
  id: r.id,
  date: r.issued_on,
  patientId: r.patient_id,
  lines: toLines(r.prescription_items),
  doses: r.dose_count,
  instructions: r.instructions,
});

/** 本诊所的预设药方 */
export async function loadTemplates(supabase: SupabaseClient, workspaceId: string): Promise<Extract<ReuseSource, { kind: "template" }>[]> {
  const { data, error } = await supabase
    .from("prescription_templates")
    .select(`id, name, dose_count, instructions, notes, use_count, last_used_at, prescription_template_items(${ITEMS})`)
    .eq("workspace_id", workspaceId)
    .returns<TemplateRow[]>();
  if (error) throw new Error(error.message);
  return (data ?? []).map((t) => ({
    kind: "template",
    id: t.id,
    name: t.name,
    lines: toLines(t.prescription_template_items),
    doses: t.dose_count,
    instructions: t.instructions,
    notes: t.notes,
    useCount: t.use_count,
    lastUsedAt: t.last_used_at,
  }));
}

/** 本诊所的处方：最近 RECENT_LIMIT 张，或者某个病人的全部，或者指定的几张 */
export async function loadPrescriptionSources(
  supabase: SupabaseClient,
  workspaceId: string,
  by: { recent: true } | { patientId: string } | { ids: string[] },
): Promise<ReuseSource[]> {
  let q = supabase.from("prescriptions").select(RX_COLUMNS).eq("workspace_id", workspaceId).eq("source", "clinic");
  if ("patientId" in by) q = q.eq("patient_id", by.patientId);
  if ("ids" in by) q = q.in("id", by.ids);
  q = q.order("issued_on", { ascending: false });
  if ("recent" in by) q = q.limit(RECENT_LIMIT);
  const { data, error } = await q.returns<RxRow[]>();
  if (error) throw new Error(error.message);
  return (data ?? []).filter((r) => r.prescription_items.length > 0).map(fromRx);
}

/** 开方页的候选：预设 + 最近的处方 + 当前病人的全部 + 照着开的那张（去重） */
export async function loadReuseSources(
  supabase: SupabaseClient,
  workspaceId: string,
  opts: { patientId: string | null; fromId: string | null },
): Promise<ReuseSource[]> {
  const [templates, recent, mine, from] = await Promise.all([
    loadTemplates(supabase, workspaceId),
    loadPrescriptionSources(supabase, workspaceId, { recent: true }),
    opts.patientId ? loadPrescriptionSources(supabase, workspaceId, { patientId: opts.patientId }) : [],
    opts.fromId ? loadPrescriptionSources(supabase, workspaceId, { ids: [opts.fromId] }) : [],
  ]);
  const seen = new Set<string>();
  return [...templates, ...recent, ...mine, ...from].filter((s) => {
    const key = `${s.kind}:${s.id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
