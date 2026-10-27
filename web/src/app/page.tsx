import Link from "next/link";
import { Suspense } from "react";
import { getContext } from "@/lib/auth";
import { grams } from "@/lib/format";
import { Loading, Stat } from "@/components/ui";
import { signOut } from "./login/actions";
import { MemberForm } from "./member-form";

export default function Home() {
  return (
    <Suspense fallback={<Loading />}>
      <Dashboard />
    </Suspense>
  );
}

async function Dashboard() {
  const { supabase, user } = await getContext();

  const [rx, inv, recent, members] = await Promise.all([
    supabase.from("prescriptions").select("id", { count: "exact", head: true }),
    supabase.from("v_inventory").select("herb_id, name_zh, on_hand_grams, is_low"),
    supabase
      .from("prescriptions")
      .select("id, title, issued_on, dose_count, prescription_items(count)")
      .order("issued_on", { ascending: false })
      .limit(5),
    supabase.from("workspace_members").select("user_id, role"),
  ]);

  const stock = (inv.data ?? []).filter((r) => Number(r.on_hand_grams) > 0);
  const low = (inv.data ?? []).filter((r) => r.is_low || Number(r.on_hand_grams) <= 0);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-3 gap-3">
        <Stat label="药方" value={rx.count ?? 0} href="/prescriptions" />
        <Stat label="药柜里的药材" value={stock.length} href="/inventory" />
        <Stat label="快用完" value={<span className={low.length ? "text-cinnabar" : ""}>{low.length}</span>} href="/inventory" />
      </div>

      <div className="flex flex-wrap gap-2">
        <Link href="/prescriptions/new" className="btn-primary">＋ 录药方 / 拍照识别</Link>
        <Link href="/purchases/new" className="btn-ghost">＋ 记一笔采购</Link>
      </div>

      <section>
        <h2 className="mb-2 font-serif text-lg font-bold">最近的药方</h2>
        <div className="card divide-y divide-line p-0">
          {(recent.data ?? []).length === 0 && <p className="p-4 text-sm text-muted">还没有药方，先录第一张吧。</p>}
          {(recent.data ?? []).map((p) => (
            <Link key={p.id} href={`/prescriptions/${p.id}`} className="flex justify-between p-4 hover:bg-paper">
              <span>{p.title || "未命名药方"}</span>
              <span className="text-sm text-muted">
                {p.issued_on} · {p.dose_count} 副 · {(p.prescription_items as unknown as { count: number }[])[0]?.count ?? 0} 味
              </span>
            </Link>
          ))}
        </div>
      </section>

      {low.length > 0 && (
        <section>
          <h2 className="mb-2 font-serif text-lg font-bold">该补货了</h2>
          <div className="flex flex-wrap gap-2">
            {low.map((r) => (
              <Link key={r.herb_id} href={`/herbs/${r.herb_id}`} className="rounded-full border border-cinnabar px-3 py-1 text-sm text-cinnabar">
                {r.name_zh} {grams(r.on_hand_grams)}
              </Link>
            ))}
          </div>
        </section>
      )}

      <section className="card space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-serif text-lg font-bold">家庭成员</h2>
          <form action={signOut}>
            <button className="text-sm text-muted underline">退出 {user.email}</button>
          </form>
        </div>
        <p className="text-sm text-muted">共 {members.data?.length ?? 1} 人共享这个药柜。让家人先注册，再在这里输入 Ta 的邮箱。</p>
        <MemberForm />
      </section>
    </div>
  );
}
