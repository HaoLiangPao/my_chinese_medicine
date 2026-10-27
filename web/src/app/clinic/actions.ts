"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { getContext } from "@/lib/auth";
import { invalidateAll } from "@/lib/invalidate";
import { resolveHerbId } from "@/lib/herbs";
import { parseJsonField, str, SPECIAL_PREPS } from "@/lib/format";
import { validateLines } from "@/lib/rx-lines";
import { patientLabel } from "@/lib/rx-message";

export type Patient = { id: string; name: string | null; phone: string | null; notes: string | null; last_rx_on?: string | null };

async function clinicContext() {
  const ctx = await getContext();
  if (ctx.workspaceKind !== "clinic") throw new Error("请先切换到诊所");
  return ctx;
}

// ---------------------------------------------------------------------------
// 诊所
// ---------------------------------------------------------------------------
export type ClinicState = { error?: string };
export async function createClinic(_prev: ClinicState, form: FormData): Promise<ClinicState> {
  const { supabase } = await getContext();
  const { error } = await supabase.rpc("create_clinic", { clinic_name: str(form.get("name")) ?? "" });
  if (error) return { error: error.message };
  invalidateAll();
  redirect("/clinic/prescribe");
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
    req = digits.length >= 3 && digits.length === q.replace(/[\s()+-]/g, "").length
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
  const name = p.data.name || null, phone = p.data.phone || null;
  if (!name && !phone) return { error: "名字和电话至少填一个" };
  const { data, error } = await supabase
    .from("patients")
    .insert({ workspace_id: workspaceId, name, phone, notes: p.data.notes || null })
    .select("id, name, phone, notes")
    .single();
  if (error) {
    if (error.message.includes("patients_phone_unique")) {
      const digits = (phone ?? "").replace(/\D/g, "");
      const { data: ex } = await supabase.from("patients").select("id, name, phone, notes").eq("workspace_id", workspaceId).eq("phone_digits", digits).maybeSingle();
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
});

export type PrescribeState = { error?: string };

export async function createClinicPrescription(_prev: PrescribeState, form: FormData): Promise<PrescribeState> {
  const { supabase, workspaceId, workspaceName } = await clinicContext();
  const parsed = Payload.safeParse(parseJsonField(form.get("payload"), null));
  if (!parsed.success) return { error: "请先选病人，并检查剂数和日期" };
  const p = parsed.data;
  const lineErr = validateLines(p.lines.map((l) => ({ ...l, note: l.note || null })));
  if (lineErr) return { error: lineErr };
  if (new Set(p.lines.map((l) => l.herbId)).size !== p.lines.length) return { error: "同一味药出现了两次" };

  const { data: patient } = await supabase.from("patients").select("id, name, phone").eq("id", p.patientId).eq("workspace_id", workspaceId).maybeSingle();
  if (!patient) return { error: "病人不存在" };

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
  invalidateAll();
  redirect(`/prescriptions/${rx.id}?new=1`);
}
