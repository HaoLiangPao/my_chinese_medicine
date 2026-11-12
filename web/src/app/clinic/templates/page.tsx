import Link from "next/link";
import { Suspense } from "react";
import { getContext } from "@/lib/auth";
import { Empty, Loading, PageHeader } from "@/components/ui";
import { ConfirmButton } from "@/components/confirm-button";
import { herbSummary } from "@/lib/rx-reuse";
import { loadTemplates } from "../reuse";
import { deleteTemplate } from "./actions";
import { RenameForm } from "./rename-form";

/** 预设药方管理（docs/design/0013 §3.3）：改名、删除、用它开方。改药材：用它开方，保存时勾「同时更新预设」 */
export default function TemplatesPage({ searchParams }: PageProps<"/clinic/templates">) {
  return (
    <>
      <PageHeader
        title="预设药方"
        subtitle="常用的方子存成预设，开方时直接选，再按病人增减"
        action={{ href: "/clinic/prescribe", label: "＋ 开方" }}
      />
      <Suspense fallback={<Loading />}>
        <List searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function List({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const { supabase, workspaceId } = await getContext();
  const templates = (await loadTemplates(supabase, workspaceId)).sort((a, b) => a.name.localeCompare(b.name, "zh"));
  return (
    <div className="space-y-3">
      {sp.deleted === "1" && <p className="rounded-md bg-paper p-3 text-sm">删掉了。以前从它开出的处方不受影响。</p>}
      <p className="text-sm text-muted">要改预设里的药材：点「用它开方」，开完保存时勾「同时更新预设」。</p>
      {!templates.length ? (
        <Empty>还没有预设药方。开方保存时可以勾「同时存成预设药方」，或者在处方详情页点「存成预设药方」。</Empty>
      ) : (
        <ul className="space-y-3" data-testid="template-list">
          {templates.map((t) => (
            <li key={t.id} className="card space-y-2" data-testid="template-card">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="font-serif text-lg font-bold" data-testid="template-name">
                  {t.name}
                </span>
                <span className="text-xs text-muted">
                  {t.useCount ? `用过 ${t.useCount} 次` : "还没用过"}
                  {t.lastUsedAt && ` · 上次 ${t.lastUsedAt.slice(0, 10)}`}
                </span>
              </div>
              <p className="text-sm text-muted">
                {herbSummary(t.lines, 8)}
                {t.doses && ` · ${t.doses} 剂`}
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <Link href={`/clinic/prescribe?template=${t.id}`} className="btn-primary min-h-11">
                  用它开方
                </Link>
                <RenameForm id={t.id} name={t.name} />
                <form action={deleteTemplate}>
                  <input type="hidden" name="id" value={t.id} />
                  <ConfirmButton
                    data-bug-label="删除预设"
                    message={`删掉预设「${t.name}」？以前从它开出的处方不受影响。`}
                    className="btn-ghost min-h-11 text-sm"
                  >
                    删除
                  </ConfirmButton>
                </form>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
