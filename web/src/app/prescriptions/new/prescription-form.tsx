"use client";

import { useActionState, useRef, useState } from "react";
import { createPrescription, type SaveState } from "../actions";
import { SPECIAL_PREPS } from "@/lib/format";
import type { ParseResponse } from "@/app/api/parse-prescription/route";
import { buildMatcher, type HerbCatalog } from "@/lib/herb-match";

type Item = { key: number; name: string; grams: string; prep: string; raw: string | null };

let nextKey = 1;
const blank = (): Item => ({ key: nextKey++, name: "", grams: "", prep: "", raw: null });

/** 手机照片动辄 5MB+，先在浏览器里缩到长边 1600px 的 JPEG 再上传 */
async function shrink(file: File): Promise<Blob> {
  const img = await createImageBitmap(file);
  const scale = Math.min(1, 1600 / Math.max(img.width, img.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(img.width * scale);
  canvas.height = Math.round(img.height * scale);
  canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b!), "image/jpeg", 0.85));
}

export function PrescriptionForm({ catalog, today }: { catalog: HerbCatalog; today: string }) {
  const [state, action, pending] = useActionState<SaveState, FormData>(createPrescription, {});
  const [items, setItems] = useState<Item[]>([blank(), blank(), blank()]);
  const [meta, setMeta] = useState({ title: "", issued_on: today, dose_count: "7", instructions: "", patient_label: "" });
  const [photoPath, setPhotoPath] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [parsing, setParsing] = useState(false);
  const [parseMsg, setParseMsg] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [match] = useState(() => buildMatcher(catalog));

  const update = (key: number, patch: Partial<Item>) =>
    setItems((xs) => xs.map((x) => (x.key === key ? { ...x, ...patch } : x)));

  async function onPhoto(file: File) {
    setParsing(true);
    setParseMsg(null);
    setPreview(URL.createObjectURL(file));
    try {
      const body = new FormData();
      body.append("photo", await shrink(file), "prescription.jpg");
      const res = await fetch("/api/parse-prescription", { method: "POST", body });
      const data = (await res.json()) as ParseResponse;
      if (!res.ok || "error" in data) {
        // 识别失败但照片已经存好了：仍然挂到这张药方上，方便手动录入时对照
        if ("photo_path" in data && data.photo_path) setPhotoPath(data.photo_path);
        throw new Error("error" in data ? data.error : res.statusText);
      }

      setPhotoPath(data.photo_path);
      const r = data.result;
      setMeta((m) => ({
        ...m,
        issued_on: r.issued_on ?? m.issued_on,
        dose_count: r.dose_count ? String(r.dose_count) : m.dose_count,
        instructions: r.instructions ?? m.instructions,
        patient_label: r.patient_name ?? m.patient_label,
      }));
      setItems(
        r.items.map((it) => ({
          key: nextKey++,
          name: it.matched_name ?? it.name,
          grams: String(it.grams ?? ""),
          prep: it.special_prep ?? "",
          raw: it.name,
        })),
      );
      const unknown = r.items.filter((i) => !i.matched_name).length;
      setParseMsg(
        `识别出 ${r.items.length} 味药` +
          (unknown ? `，其中 ${unknown} 味不在药材目录里（标红），保存时会新建——请核对名字。` : "。请对照照片核对一遍。") +
          (r.notes ? `\nAI 备注：${r.notes}` : ""),
      );
    } catch (e) {
      setParseMsg(`识别失败：${(e as Error).message}。可以手动填写。`);
    } finally {
      setParsing(false);
    }
  }

  const filled = items.filter((i) => i.name.trim() && Number(i.grams) > 0);
  const totalPerDose = filled.reduce((s, i) => s + Number(i.grams), 0);

  return (
    <form action={action} className="space-y-5">
      {/* 拍照识别 */}
      <div className="card flex flex-col gap-3 sm:flex-row sm:items-center">
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => e.target.files?.[0] && onPhoto(e.target.files[0])}
        />
        <button type="button" onClick={() => fileRef.current?.click()} disabled={parsing} className="btn-primary">
          {parsing ? "识别中…（10–30 秒）" : "📷 拍照 / 选照片识别"}
        </button>
        {preview && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview} alt="药方照片" className="h-24 w-auto rounded-md border border-line object-cover" />
        )}
        {parseMsg && <p className="whitespace-pre-line text-sm text-muted">{parseMsg}</p>}
      </div>
      <input type="hidden" name="photo_path" value={photoPath ?? ""} />

      {/* 基本信息 */}
      <div className="card grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="col-span-2 sm:col-span-3">
          <label className="label">名称（可选）</label>
          <input name="title" value={meta.title} onChange={(e) => setMeta({ ...meta, title: e.target.value })} placeholder="如：十月调理方" className="input" />
        </div>
        <div>
          <label className="label">开方日期</label>
          <input name="issued_on" type="date" value={meta.issued_on} onChange={(e) => setMeta({ ...meta, issued_on: e.target.value })} className="input" />
        </div>
        <div>
          <label className="label">剂数（几副）</label>
          <input name="dose_count" type="number" min={1} value={meta.dose_count} onChange={(e) => setMeta({ ...meta, dose_count: e.target.value })} className="input" />
        </div>
        <div>
          <label className="label">谁吃的</label>
          <input name="patient_label" value={meta.patient_label} onChange={(e) => setMeta({ ...meta, patient_label: e.target.value })} className="input" />
        </div>
        <div>
          <label className="label">医生</label>
          <input name="prescriber" defaultValue="李医生" className="input" />
        </div>
        <div>
          <label className="label">实付金额 (CAD)</label>
          <input name="price_paid" type="number" step="0.01" min={0} className="input" />
        </div>
        <div className="col-span-2 sm:col-span-3">
          <label className="label">煎服法</label>
          <input name="instructions" value={meta.instructions} onChange={(e) => setMeta({ ...meta, instructions: e.target.value })} placeholder="如：水煎服，日一剂，早晚分服" className="input" />
        </div>
      </div>

      {/* 药材明细 */}
      <div className="card space-y-2">
        <div className="flex items-baseline justify-between">
          <h2 className="font-serif text-lg font-bold">药材</h2>
          <span className="text-sm text-muted">
            {filled.length} 味 · 每副 {totalPerDose} g
          </span>
        </div>
        <datalist id="herb-names">
          {catalog.names.map((n) => (
            <option key={n} value={n} />
          ))}
        </datalist>
        {items.map((it) => {
          const m = match(it.name);
          return (
            <div key={it.key} className="grid grid-cols-[1fr_5rem_5.5rem_2rem] items-center gap-x-2 gap-y-1">
              <input
                list="herb-names"
                value={it.name}
                onChange={(e) => update(it.key, { name: e.target.value })}
                placeholder="药名"
                aria-label="药名"
                className={`input ${m.kind === "unknown" ? "border-cinnabar text-cinnabar" : ""}`}
                title={it.raw && it.raw !== it.name ? `原文：${it.raw}` : undefined}
              />
              <input
                type="number"
                step="0.5"
                min={0}
                value={it.grams}
                onChange={(e) => update(it.key, { grams: e.target.value })}
                placeholder="克"
                aria-label="每副克数"
                className="input"
              />
              <select aria-label="脚注" value={it.prep} onChange={(e) => update(it.key, { prep: e.target.value })} className="input px-1">
                <option value="">—</option>
                {SPECIAL_PREPS.map((p) => (
                  <option key={p}>{p}</option>
                ))}
              </select>
              <button type="button" onClick={() => setItems((xs) => xs.filter((x) => x.key !== it.key))} className="text-muted hover:text-cinnabar" aria-label="删除">
                ✕
              </button>
              {m.kind === "alias" && (
                <p className="col-span-4 text-xs text-muted" data-testid="alias-hint">
                  {it.name.trim()} = {m.canonical}（别名，保存为 {m.canonical}）
                </p>
              )}
            </div>
          );
        })}
        <button type="button" onClick={() => setItems((xs) => [...xs, blank()])} className="btn-ghost w-full">
          ＋ 加一味
        </button>
      </div>

      <input
        type="hidden"
        name="items"
        value={JSON.stringify(filled.map((i) => ({ name: i.name, grams: Number(i.grams), prep: i.prep || null, raw: i.raw })))}
      />
      <div>
        <label className="label">备注</label>
        <textarea name="notes" rows={2} className="input" />
      </div>
      {state.error && <p className="text-sm text-cinnabar">{state.error}</p>}
      <button disabled={pending || parsing || filled.length === 0} className="btn-primary w-full py-3">
        {pending ? "保存中…" : "保存药方"}
      </button>
    </form>
  );
}
