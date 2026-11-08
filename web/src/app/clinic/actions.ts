"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { getContext } from "@/lib/auth";
import { invalidateAll } from "@/lib/invalidate";
import { resolveHerbId } from "@/lib/herbs";
import { parseJsonField, SPECIAL_PREPS } from "@/lib/format";
import { validateLines } from "@/lib/rx-lines";
import { patientLabel } from "@/lib/rx-message";
import type { ReuseSource } from "@/lib/rx-reuse";
import { loadPrescriptionSources } from "./reuse";

export type Patient = { id: string; name: string | null; phone: string | null; notes: string | null; last_rx_on?: string | null };

async function clinicContext() {
  const ctx = await getContext();
  if (ctx.accountKind !== "clinic") throw new Error("只有诊所账号可以开方");
  return ctx;
}

// ---------------------------------------------------------------------------
// 病人
// ---------------------------------------------------------------------------
/** 按名字或电话（只比数字，可以输后几位）搜病人；空查询返回最近的 */
export async function searchPatients(query: string): Promise<Patient[]> {
  const { supabase, workspaceId } = await clinicContext();
  const q = query.trim().slice(0, 30);
  let req = supabase.from("patients").select("id, name, phone, notes").eq("workspace_id", workspaceId);
  if (q) {
    const digits = q.replace(/\D/g, "");
    const safe = q.replace(/[%_,()*\\]/g, "");
    req =
      digits.length >= 3 && digits.length === q.replace(/[\s()+-]/g, "").length
        ? req.like("phone_digits", `%${digits}%`)
        : req.ilike("name", `%${safe}%`);
  }
  const { data, error } = await req.order("created_at", { ascending: false }).limit(10);
  if (error) throw new Error(error.message);
  return (data ?? []) as Patient[];
}

export type NewPatientResult = { patient?: Patient; error?: string; existing?: Patient };
const PatientInput = z.object({
  name: z.string().trim().max(50).optional(),
  phone: z.string().trim().max(30).optional(),
  notes: z.string().trim().max(500).optional(),
});

export async function createPatient(input: { name?: string; phone?: string; notes?: string }): Promise<NewPatientResult> {
  const { supabase, workspaceId } = await clinicContext();
  const p = PatientInput.safeParse(input);
  if (!p.success) return { error: "名字最多 50 字，电话最多 30 位" };
  const name = p.data.name || null,
    phone = p.data.phone || null;
  if (!name && !phone) return { error: "名字和电话至少填一个" };
  const { data, error } = await supabase
    .from("patients")
    .insert({ workspace_id: workspaceId, name, phone, notes: p.data.notes || null })
    .select("id, name, phone, notes")
    .single();
  if (error) {
    if (error.message.includes("patients_phone_unique")) {
      const digits = (phone ?? "").replace(/\D/g, "");
      const { data: ex } = await supabase
        .from("patients")
        .select("id, name, phone, notes")
        .eq("workspace_id", workspaceId)
        .eq("phone_digits", digits)
        .maybeSingle();
      return { error: `这个电话已经有病人了：${patientLabel(ex ?? {})}`, existing: (ex ?? undefined) as Patient | undefined };
    }
    return { error: error.message };
  }
  // 不调用 invalidateAll()：开方页上正在填的表单不能被整页刷新打断；病人页面每次访问都是实时渲染的
  return { patient: data as Patient };
}

/** 开方时新增目录里没有的药材（只写名字，和其他地方一样） */
export async function addHerb(name: string): Promise<{ id?: string; name?: string; error?: string }> {
  const { supabase } = await clinicContext();
  const n = name.trim();
  if (!n || n.length > 20) return { error: "药名不对" };
  try {
    const id = await resolveHerbId(supabase, n);
    const { data } = await supabase.from("herbs").select("name_zh").eq("id", id).single();
    return { id, name: data?.name_zh ?? n };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

// ---------------------------------------------------------------------------
// 开方
// ---------------------------------------------------------------------------
const Payload = z.object({
  patientId: z.string().uuid(),
  doses: z.coerce.number().int().min(1).max(60),
  issuedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  instructions: z.string().trim().max(200).optional(),
  advice: z.string().trim().max(500).optional(),
  lines: z
    .array(
      z.object({
        herbId: z.string().uuid(),
        name: z.string(),
        grams: z.number(),
        prep: z.enum(SPECIAL_PREPS).nullable(),
        note: z.string().trim().max(200).nullable(),
      }),
    )
    .max(60),
  // 基于已有药方开的（docs/design/0013）：来源 + 要不要存成 / 更新预设药方
  sourceTemplateId: z.string().uuid().nullish(),
  sourcePrescriptionId: z.string().uuid().nullish(),
  saveTemplateName: z.string().trim().min(1, "请给预设药方起个名字").max(40, "预设药方的名字最多 40 个字").nullish(),
  updateTemplate: z.boolean().nullish(),
});

export type PrescribeState = { error?: string };

/** 开方页「从已有药方开始」→「当前病人的」：中途换了病人时按需加载这个病人的全部处方（不受「全部」的数量上限限制） */
export async function patientReuseSources(patientId: string): Promise<ReuseSource[]> {
  const { supabase, workspaceId } = await clinicContext();
  if (!z.string().uuid().safeParse(patientId).success) return [];
  return loadPrescriptionSources(supabase, workspaceId, { patientId });
}

export async function createClinicPrescription(_prev: PrescribeState, form: FormData): Promise<PrescribeState> {
  const { supabase, workspaceId, workspaceName } = await clinicContext();
  const parsed = Payload.safeParse(parseJsonField(form.get("payload"), null));
  if (!parsed.success) return { error: "请先选病人，并检查剂数和日期" };
  const p = parsed.data;
  const lineErr = validateLines(p.lines.map((l) => ({ ...l, note: l.note || null })));
  if (lineErr) return { error: lineErr };
  if (new Set(p.lines.map((l) => l.herbId)).size !== p.lines.length) return { error: "同一味药出现了两次" };

  const { data: patient } = await supabase
    .from("patients")
    .select("id, name, phone")
    .eq("id", p.patientId)
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  if (!patient) return { error: "病人不存在" };

  // 来源只是记录：开方期间来源被删了（另一个标签页删了预设 / 原处方），就当没照着开，不报错
  const [srcTpl, srcRx] = await Promise.all([
    p.sourceTemplateId
      ? supabase.from("prescription_templates").select("id").eq("id", p.sourceTemplateId).eq("workspace_id", workspaceId).maybeSingle()
      : Promise.resolve({ data: null }),
    p.sourcePrescriptionId
      ? supabase.from("prescriptions").select("id").eq("id", p.sourcePrescriptionId).eq("workspace_id", workspaceId).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  const sourceTemplateId = srcTpl.data ? p.sourceTemplateId! : null;
  const sourcePrescriptionId = srcRx.data ? p.sourcePrescriptionId! : null;

  // 要存成新的预设药方：先看名字有没有被用过（处方存好以后再报错就晚了）
  if (p.saveTemplateName) {
    const { data: dup } = await supabase
      .from("prescription_templates")
      .select("id")
      .eq("workspace_id", workspaceId)
      .eq("name", p.saveTemplateName)
      .maybeSingle();
    if (dup) return { error: `已经有叫「${p.saveTemplateName}」的预设药方了，换个名字` };
  }

  const { data: rx, error } = await supabase
    .from("prescriptions")
    .insert({
      workspace_id: workspaceId,
      patient_id: patient.id,
      source: "clinic",
      title: `${patientLabel(patient)} ${p.issuedOn}`,
      prescriber: workspaceName,
      patient_label: patientLabel(patient),
      issued_on: p.issuedOn,
      dose_count: p.doses,
      instructions: p.instructions || null,
      notes: p.advice || null,
      source_template_id: sourceTemplateId,
      source_prescription_id: sourcePrescriptionId,
    })
    .select("id")
    .single();
  if (error) return { error: error.message };

  const { error: itemErr } = await supabase.from("prescription_items").insert(
    p.lines.map((l, i) => ({
      prescription_id: rx.id,
      herb_id: l.herbId,
      grams_per_dose: l.grams,
      special_prep: l.prep,
      note: l.note || null,
      raw_name: l.name,
      sort_order: i,
    })),
  );
  if (itemErr) {
    await supabase.from("prescriptions").delete().eq("id", rx.id);
    return { error: itemErr.message };
  }

  // 预设药方（每个操作是一个数据库函数 = 一个事务，不会只改一半）。处方已经存好了，这里出错不影响处方，
  // 只在详情页提示：tplerr=update（更新预设没成功）/ create（新建预设没成功）
  const tplLines = p.lines.map((l) => ({ herb_id: l.herbId, grams: l.grams, prep: l.prep, note: l.note || null }));
  let tplErr: "update" | "create" | null = null;
  if (sourceTemplateId) {
    const { error: e1 } = await supabase.rpc("use_prescription_template", {
      p_template_id: sourceTemplateId,
      p_update: !!p.updateTemplate,
      p_doses: p.doses,
      p_instructions: p.instructions || null,
      p_notes: p.advice || null,
      p_lines: tplLines,
    });
    if (e1) {
      console.error("更新预设药方没成功", e1.message);
      if (p.updateTemplate) tplErr = "update";
    }
  }
  if (p.saveTemplateName) {
    const { error: e2 } = await supabase.rpc("create_prescription_template", {
      p_workspace_id: workspaceId,
      p_name: p.saveTemplateName,
      p_doses: p.doses,
      p_instructions: p.instructions || null,
      p_notes: p.advice || null,
      p_lines: tplLines,
      p_used: true,
    });
    if (e2) {
      console.error("新建预设药方没成功", e2.message);
      tplErr = "create";
    }
  }
  invalidateAll();
  redirect(`/prescriptions/${rx.id}?new=1${tplErr ? `&tplerr=${tplErr}` : ""}`);
}
