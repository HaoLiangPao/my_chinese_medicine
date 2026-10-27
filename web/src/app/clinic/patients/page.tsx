import Link from "next/link";
import { Suspense } from "react";
import { getContext } from "@/lib/auth";
import { Empty, Loading, PageHeader } from "@/components/ui";
import { CreateClinicForm } from "../create-clinic-form";

export default function PatientsPage({ searchParams }: PageProps<"/clinic/patients">) {
  return (
    <>
      <PageHeader title="病人" subtitle="每位病人的历次处方" action={{ href: "/clinic/prescribe", label: "＋ 开方" }} />
      <Suspense fallback={<Loading />}>
        <List searchParams={searchParams} />
      </Suspense>
    </>
  );
}

type Row = { id: string; name: string | null; phone: string | null; created_at: string; prescriptions: { issued_on: string }[] };

async function List({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { supabase, workspaceId, workspaceKind } = await getContext();
  if (workspaceKind !== "clinic") return <CreateClinicForm />;
  const q = typeof (await searchParams).q === "string" ? String((await searchParams).q).trim() : "";

  let req = supabase.from("patients").select("id, name, phone, created_at, prescriptions(issued_on)").eq("workspace_id", workspaceId);
  if (q) {
    const digits = q.replace(/\D/g, "");
    req = digits.length >= 3 ? req.like("phone_digits", `%${digits}%`) : req.ilike("name", `%${q.replace(/[%_,()*\\]/g, "")}%`);
  }
  const { data, error } = await req.order("created_at", { ascending: false }).returns<Row[]>();
  if (error) throw new Error(error.message);

  return (
    <div className="space-y-3">
      <form className="flex gap-2">
        <input name="q" defaultValue={q} placeholder="名字或电话（可以只输后几位）" aria-label="搜病人" className="input" />
        <button className="btn-ghost shrink-0">搜</button>
      </form>
      {!data.length ? (
        <Empty>{q ? "没找到。" : "还没有病人。开方时可以直接新建。"}</Empty>
      ) : (
        <div className="card divide-y divide-line p-0" data-testid="patient-list">
          {data.map((p) => {
            const last = p.prescriptions.map((r) => r.issued_on).sort().at(-1);
            return (
              <Link key={p.id} href={`/clinic/patients/${p.id}`} className="flex items-center justify-between gap-2 p-4 hover:bg-paper">
                <div>
                  <div className="font-medium">{p.name || "（没填名字）"}</div>
                  <div className="text-sm text-muted">{p.phone ?? "没填电话"}</div>
                </div>
                <div className="text-right text-sm text-muted">
                  {p.prescriptions.length} 张处方
                  {last && <div>最近 {last}</div>}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
