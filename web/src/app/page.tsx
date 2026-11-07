import Link from "next/link";
import { Suspense } from "react";
import { getContext } from "@/lib/auth";
import { grams } from "@/lib/format";
import { patientLabel } from "@/lib/rx-message";
import { termsFor } from "@/lib/terms";
import { Loading, Stat } from "@/components/ui";
import { ClinicAccount, Family } from "./family";

export default function Home() {
  return (
    <Suspense fallback={<Loading />}>
      <Dashboard />
    </Suspense>
  );
}

type Recent = {
  id: string;
  title: string | null;
  issued_on: string;
  dose_count: number;
  prescription_items: { count: number }[];
  patients: { name: string | null; phone: string | null } | null;
};

async function Dashboard() {
  const { supabase, user, workspaceId, accountKind } = await getContext();
  const clinic = accountKind === "clinic";
  const t = termsFor(accountKind);

  const [rx, inv, recent] = await Promise.all([
    supabase.from("prescriptions").select("id", { count: "exact", head: true }).eq("workspace_id", workspaceId),
    supabase.from("v_inventory").select("herb_id, name_zh, on_hand_grams, is_low").eq("workspace_id", workspaceId),
    supabase
      .from("prescriptions")
      .select("id, title, issued_on, dose_count, prescription_items(count), patients(name, phone)")
      .eq("workspace_id", workspaceId)
      .order("issued_on", { ascending: false })
      .limit(5)
      .returns<Recent[]>(),
  ]);

  const stock = (inv.data ?? []).filter((r) => Number(r.on_hand_grams) > 0);
  const low = (inv.data ?? []).filter((r) => r.is_low || Number(r.on_hand_grams) <= 0);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-3 gap-3">
        <Stat label={t.rx} value={rx.count ?? 0} href="/prescriptions" />
        <Stat label={clinic ? "库存药材" : "药柜里的药材"} value={stock.length} href="/inventory" />
        <Stat label="快用完" value={<span className={low.length ? "text-cinnabar" : ""}>{low.length}</span>} href="/inventory" />
      </div>

      <div className="flex flex-wrap gap-2">
        {clinic ? (
          <Link href="/clinic/prescribe" className="btn-primary">＋ 开方</Link>
        ) : (
          <Link href="/prescriptions/new" className="btn-primary">＋ 录药方 / 拍照识别</Link>
        )}
        <Link href="/purchases/new" className="btn-ghost">＋ 记一笔{t.purchase}</Link>
      </div>

      <section>
        <h2 className="mb-2 font-serif text-lg font-bold">最近的{t.rx}</h2>
        <div className="card divide-y divide-line p-0">
          {(recent.data ?? []).length === 0 && (
            <p className="p-4 text-sm text-muted">{clinic ? "还没有处方，先开第一张吧。" : "还没有药方，先录第一张吧。"}</p>
          )}
          {(recent.data ?? []).map((p) => (
            <Link key={p.id} href={`/prescriptions/${p.id}`} className="flex justify-between gap-3 p-4 hover:bg-paper">
              <span>{clinic && p.patients ? patientLabel(p.patients) : p.title || `未命名${t.rx}`}</span>
              <span className="shrink-0 text-sm text-muted">
                {p.issued_on} · {p.dose_count} {t.dose} · {p.prescription_items[0]?.count ?? 0} 味
              </span>
            </Link>
          ))}
        </div>
      </section>

      {low.length > 0 && (
        <section>
          <h2 className="mb-2 font-serif text-lg font-bold">{clinic ? "该进货了" : "该补货了"}</h2>
          <div className="flex flex-wrap gap-2">
            {low.map((r) => (
              <Link key={r.herb_id} href={`/herbs/${r.herb_id}`} className="rounded-full border border-cinnabar px-3 py-1 text-sm text-cinnabar">
                {r.name_zh} {grams(r.on_hand_grams)}
              </Link>
            ))}
          </div>
        </section>
      )}

      {clinic ? (
        <ClinicAccount user={user} />
      ) : (
        <Family supabase={supabase} user={user} workspaceId={workspaceId} />
      )}
    </div>
  );
}
