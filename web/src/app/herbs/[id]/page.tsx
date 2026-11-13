import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { getContext } from "@/lib/auth";
import { termsFor } from "@/lib/terms";
import { grams, money } from "@/lib/format";
import { Loading, Stat } from "@/components/ui";
import { resolveMonograph, type Monograph } from "@/lib/herb-monograph";
import { MonographSection, MonographTags } from "./monograph";
import { BatchesSection, type BatchRow } from "./batches";
import { resolvePhoto, type HerbPhoto } from "@/lib/herb-photo";
import { HerbPhotoFigure, JarPhotoFigure } from "./photo";
import { NoPhoto } from "@/components/no-photo";
import { JarPhotoControls } from "./jar-photo-controls";
import { JAR_BUCKET } from "@/lib/jar-photo";

export default function HerbPage({ params }: PageProps<"/herbs/[id]">) {
  return (
    <Suspense fallback={<Loading />}>
      <Detail params={params} />
    </Suspense>
  );
}

type Use = {
  grams_per_dose: number;
  special_prep: string | null;
  prescriptions: { id: string; title: string | null; issued_on: string; dose_count: number } | null;
};

async function Detail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, workspaceId, accountKind } = await getContext();
  const t = termsFor(accountKind);

  const { data: herbRow } = await supabase
    .from("herbs")
    .select("id, name_zh, pinyin, category, notes, base:base_herb_id(id, name_zh), herb_aliases(alias)")
    .eq("id", id)
    .maybeSingle();
  const herb = herbRow as unknown as {
    id: string;
    name_zh: string;
    pinyin: string | null;
    category: string | null;
    notes: string | null;
    base: { id: string; name_zh: string } | null;
    herb_aliases: { alias: string }[];
  } | null;
  if (!herb) notFound();

  const monographIds = [herb.id, ...(herb.base ? [herb.base.id] : [])];
  const [
    { data: uses },
    { data: inv },
    { data: prices },
    { data: usage },
    { data: monographs },
    { data: isReviewer },
    { data: batchRows },
    { data: photos },
    { data: pantry },
  ] = await Promise.all([
    supabase
      .from("prescription_items")
      .select("grams_per_dose, special_prep, prescriptions!inner(id, title, issued_on, dose_count, workspace_id)")
      .eq("herb_id", id)
      .eq("prescriptions.workspace_id", workspaceId)
      .returns<Use[]>(),
    supabase.from("v_inventory").select("on_hand_grams").eq("workspace_id", workspaceId).eq("herb_id", id).maybeSingle(),
    supabase
      .from("v_purchase_prices")
      .select("*")
      .eq("workspace_id", workspaceId)
      .eq("herb_id", id)
      .order("purchased_on", { ascending: false }),
    supabase.from("v_herb_usage").select("*").eq("workspace_id", workspaceId).eq("herb_id", id).maybeSingle(),
    supabase.from("herb_monographs").select("*").in("herb_id", monographIds).returns<Monograph[]>(),
    supabase.rpc("is_monograph_reviewer"),
    supabase
      .from("purchase_items")
      .select(
        "id, grams, price, origin, lot_no, supplier_lot, packed_on, purchases!inner(purchased_on, created_at, workspace_id, stores(name))",
      )
      .eq("herb_id", id)
      .eq("purchases.workspace_id", workspaceId)
      .returns<
        (Omit<BatchRow, "purchased_on" | "created_at" | "store"> & {
          purchases: { purchased_on: string; created_at: string; stores: { name: string } | null };
        })[]
      >(),
    supabase
      .from("herb_photos")
      .select("herb_id, file, kind, author, license, license_url, source_url, width, height")
      .in("herb_id", monographIds)
      .returns<HerbPhoto[]>(),
    supabase.from("pantry_settings").select("photo_path").eq("workspace_id", workspaceId).eq("herb_id", id).maybeSingle(),
  ]);
  const batches: BatchRow[] = (batchRows ?? []).map(({ purchases: pu, ...b }) => ({
    ...b,
    purchased_on: pu.purchased_on,
    created_at: pu.created_at,
    store: pu.stores?.name ?? null,
  }));
  const byHerb = new Map((monographs ?? []).map((m) => [m.herb_id, m]));
  const monograph = resolveMonograph(byHerb.get(herb.id) ?? null, herb.base ? (byHerb.get(herb.base.id) ?? null) : null);
  const photosByHerb = new Map((photos ?? []).map((p) => [p.herb_id, p]));
  const photo = resolvePhoto(photosByHerb.get(herb.id) ?? null, herb.base ? (photosByHerb.get(herb.base.id) ?? null) : null);
  // 本罐照片（私有，只有本药柜能看）优先；没有就用默认照片（docs/design/0010 §3.5）
  const jarPath = (pantry?.photo_path as string | null) ?? null;
  const { data: jarSigned } = jarPath ? await supabase.storage.from(JAR_BUCKET).createSignedUrl(jarPath, 3600) : { data: null };
  const jarUrl = jarSigned?.signedUrl ?? null;
  const sortedUses = (uses ?? []).sort((a, b) => (b.prescriptions?.issued_on ?? "").localeCompare(a.prescriptions?.issued_on ?? ""));

  return (
    <div className="space-y-5">
      <div>
        <Link href="/herbs" className="text-sm text-muted">
          ← 药材
        </Link>
        {/* 本罐照片（只有本药柜能看）优先，其次默认照片，都没有就是占位图，占位图下面直接放「拍一张上传」 */}
        <div className="mt-2 space-y-2">
          {jarUrl ? (
            <JarPhotoFigure url={jarUrl} />
          ) : photo ? (
            <HerbPhotoFigure photo={photo.photo} fromBase={photo.fromBase} baseName={herb.base?.name_zh ?? null} />
          ) : null}
          {jarUrl || photo ? (
            <JarPhotoControls herbId={herb.id} hasJarPhoto={jarPath !== null} />
          ) : (
            <NoPhoto>
              <JarPhotoControls herbId={herb.id} hasJarPhoto={jarPath !== null} emptyLabel="📷 拍一张上传" />
            </NoPhoto>
          )}
        </div>
        <h1 className="mt-1 font-serif text-3xl font-bold">{herb.name_zh}</h1>
        <p className="mt-1 text-sm text-muted">
          {[herb.pinyin, herb.category].filter(Boolean).join(" · ")}
          {herb.base && (
            <>
              {" "}
              · 炮制品，原药材{" "}
              <Link href={`/herbs/${herb.base.id}`} className="underline">
                {herb.base.name_zh}
              </Link>
            </>
          )}
          {herb.herb_aliases.length > 0 && ` · 别名 ${herb.herb_aliases.map((a) => a.alias).join("、")}`}
        </p>
        {monograph?.data.latin_name && <p className="text-sm italic text-muted">{monograph.data.latin_name}</p>}
        {monograph && <MonographTags m={monograph.data} />}
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Stat label={`${t.stock}存量`} value={inv ? grams(inv.on_hand_grams) : "—"} />
        <Stat label="出现在几张方子" value={usage?.prescription_count ?? 0} />
        <Stat label="累计用量" value={grams(usage?.total_grams ?? 0)} />
      </div>

      {monograph && (
        <MonographSection
          m={monograph.data}
          fromBase={monograph.fromBase}
          inheritsDraft={monograph.inheritsDraft}
          baseName={herb.base?.name_zh ?? null}
          isReviewer={isReviewer === true}
        />
      )}

      <BatchesSection batches={batches} onHand={Number(inv?.on_hand_grams ?? 0)} />

      <section className="card overflow-x-auto">
        <h2 className="mb-2 font-serif text-lg font-bold">出现在这些{t.rx}里</h2>
        {!sortedUses.length ? (
          <p className="text-sm text-muted">还没有。</p>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>{t.rx}</th>
                <th>日期</th>
                <th className="text-right">每{t.dose}</th>
                <th className="text-right">{t.dose}数</th>
              </tr>
            </thead>
            <tbody>
              {sortedUses.map((u) => (
                <tr key={u.prescriptions?.id}>
                  <td>
                    <Link href={`/prescriptions/${u.prescriptions?.id}`} className="hover:text-cinnabar">
                      {u.prescriptions?.title || `未命名${t.rx}`}
                    </Link>
                    {u.special_prep && <span className="ml-1 text-xs text-amber">{u.special_prep}</span>}
                  </td>
                  <td className="text-muted">{u.prescriptions?.issued_on}</td>
                  <td className="text-right">{grams(u.grams_per_dose)}</td>
                  <td className="text-right">{u.prescriptions?.dose_count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="card overflow-x-auto">
        <h2 className="mb-2 font-serif text-lg font-bold">{accountKind === "clinic" ? "进货" : "购买"}记录</h2>
        {!prices?.length ? (
          <p className="text-sm text-muted">还没有。</p>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>日期</th>
                <th>店铺</th>
                <th className="text-right">克数</th>
                <th className="text-right">价格</th>
                <th className="text-right">每 100g</th>
              </tr>
            </thead>
            <tbody>
              {prices.map((p, i) => (
                <tr key={i}>
                  <td className="text-muted">{p.purchased_on}</td>
                  <td>{p.store_name ?? "—"}</td>
                  <td className="text-right">{grams(p.grams)}</td>
                  <td className="text-right">{money(p.price)}</td>
                  <td className="text-right">{money(Number(p.price_per_gram) * 100)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
