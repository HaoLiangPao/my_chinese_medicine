import { Suspense } from "react";
import { z } from "zod";
import { pinyin } from "pinyin-pro";
import { getContext } from "@/lib/auth";
import { listHerbAliases, listHerbs } from "@/lib/herbs";
import { buildHerbIndex } from "@/lib/herb-index";
import { Loading, PageHeader } from "@/components/ui";
import { PrescribeForm } from "./prescribe-form";
import type { Patient } from "../actions";
import { loadReuseSources, RECENT_LIMIT } from "../reuse";

export default function PrescribePage({ searchParams }: PageProps<"/clinic/prescribe">) {
  return (
    <>
      <PageHeader title="开方" subtitle="选病人 → 按首字母选药 → 克数、脚注、备注 → 生成发给病人的消息" />
      <Suspense fallback={<Loading />}>
        <Loader searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function Loader({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { supabase, workspaceId, workspaceName } = await getContext();

  const sp = await searchParams;
  // 网址里的 id 不是合法 UUID（手改、链接被截断）：当作没有这个参数，不要让整页报错
  const uuidParam = (v: unknown) => (typeof v === "string" && z.string().uuid().safeParse(v).success ? v : null);
  const patientId = uuidParam(sp.patient);
  const fromId = uuidParam(sp.from);
  const templateId = uuidParam(sp.template);
  const [herbs, aliases, { data: prices }, { data: pre }, sources] = await Promise.all([
    listHerbs(supabase),
    listHerbAliases(supabase),
    supabase.from("v_herb_price_summary").select("herb_id, min_ppg, avg_cost_per_gram").eq("workspace_id", workspaceId),
    patientId
      ? supabase.from("patients").select("id, name, phone, notes").eq("workspace_id", workspaceId).eq("id", patientId).maybeSingle()
      : Promise.resolve({ data: null }),
    loadReuseSources(supabase, workspaceId, { patientId, fromId }),
  ]);
  // ?template=… 用预设开方；?from=… 照着某张处方再开一张（docs/design/0013）
  const initialSource =
    (templateId && sources.find((s) => s.kind === "template" && s.id === templateId)) ||
    (fromId && sources.find((s) => s.kind === "prescription" && s.id === fromId)) ||
    null;

  // 没有拼音的药材（用户新加的）在服务器端补上，不把拼音库打包到浏览器
  const index = buildHerbIndex(herbs, (name) => pinyin(name, { toneType: "none", type: "string" }), aliases);
  // 成本用诊所各店最低进货价；只有赠品/没进过货的药没有价格
  const ppg: Record<string, number> = {};
  for (const p of prices ?? []) {
    const v = p.min_ppg ?? p.avg_cost_per_gram;
    if (v !== null && v !== undefined) ppg[p.herb_id] = Number(v);
  }

  return (
    <PrescribeForm
      index={index}
      pricePerGram={ppg}
      clinicName={workspaceName}
      initialPatient={(pre as Patient | null) ?? null}
      today={new Date().toLocaleDateString("en-CA", { timeZone: "America/Toronto" })}
      sources={sources}
      recentLimit={RECENT_LIMIT}
      initialSource={initialSource}
    />
  );
}
