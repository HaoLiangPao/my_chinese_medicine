import Link from "next/link";
import { Suspense } from "react";
import { getContext } from "@/lib/auth";
import { Loading, PageHeader } from "@/components/ui";
import { KIND_LABEL, type HerbPhoto } from "@/lib/herb-photo";

/** 药材默认照片的出处汇总（docs/design/0010 §3.5）。CC BY / CC BY-SA 要求写明作者、授权和改动 */
export default function PhotoCreditsPage() {
  return (
    <>
      <Link href="/herbs" className="text-sm text-muted">
        ← 药材
      </Link>
      <PageHeader title="药材照片出处" subtitle="照片来自 Wikimedia Commons，按各自的授权使用" />
      <Suspense fallback={<Loading />}>
        <Credits />
      </Suspense>
    </>
  );
}

async function Credits() {
  const { supabase } = await getContext();
  const { data } = await supabase
    .from("herb_photos")
    .select("herb_id, file, kind, author, license, license_url, source_url, width, height, herbs(name_zh, pinyin)")
    .returns<(HerbPhoto & { herbs: { name_zh: string; pinyin: string | null } | null })[]>();
  const rows = (data ?? []).sort((a, b) => (a.herbs?.pinyin ?? "").localeCompare(b.herbs?.pinyin ?? ""));

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">
        所有照片都只做了缩放和格式转换（转为 WebP），没有其他修改。照片仅用于认药，不代表某个批次的实际样子。
      </p>
      {!rows.length ? (
        <p className="text-sm text-muted">还没有照片。</p>
      ) : (
        <section className="card overflow-x-auto">
          <table className="data-table" data-testid="photo-credits">
            <thead>
              <tr>
                <th>药材</th>
                <th>照片</th>
                <th>作者</th>
                <th>授权</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.herb_id}>
                  <td>
                    <Link href={`/herbs/${r.herb_id}`} className="font-medium hover:text-cinnabar">
                      {r.herbs?.name_zh}
                    </Link>
                  </td>
                  <td>
                    <a href={r.source_url} target="_blank" rel="noopener noreferrer" className="underline">
                      {KIND_LABEL[r.kind]}
                    </a>
                  </td>
                  <td className="break-all">{r.author ?? "—"}</td>
                  <td>
                    {r.license_url ? (
                      <a href={r.license_url} target="_blank" rel="noopener noreferrer" className="underline">
                        {r.license}
                      </a>
                    ) : (
                      r.license
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}
