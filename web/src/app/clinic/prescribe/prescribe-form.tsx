"use client";

import { useActionState, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { SPECIAL_PREPS, money } from "@/lib/format";
import { canAddHerb, searchHerbs, type HerbChoice, type HerbEntry, type HerbIndex } from "@/lib/herb-index";
import { COMMON_GRAMS, lineCosts, moveLine, removeLine, upsertLine, validateLines, type RxLine } from "@/lib/rx-lines";
import { summarizeCost } from "@/lib/pricing";
import { patientLabel } from "@/lib/rx-message";
import { addHerb, createClinicPrescription, createPatient, searchPatients, type Patient, type PrescribeState } from "../actions";

type Picked = { entry: HerbEntry; choice: HerbChoice | null };

export function PrescribeForm({
  index,
  pricePerGram,
  clinicName,
  initialPatient,
  today,
}: {
  index: HerbIndex;
  pricePerGram: Record<string, number>;
  clinicName: string;
  initialPatient: Patient | null;
  today: string;
}) {
  const [state, action, pending] = useActionState<PrescribeState, FormData>(createClinicPrescription, {});
  const [patient, setPatient] = useState<Patient | null>(initialPatient);
  const [lines, setLines] = useState<RxLine[]>([]);
  const [picked, setPicked] = useState<Picked | null>(null);
  const [doses, setDoses] = useState("7");
  const [issuedOn, setIssuedOn] = useState(today);
  const [instructions, setInstructions] = useState("水煎服，日一剂，早晚分服");
  const [advice, setAdvice] = useState("");

  const ppg = useMemo(() => new Map(Object.entries(pricePerGram)), [pricePerGram]);
  const costs = lineCosts(lines, ppg);
  const n = Math.max(0, Math.floor(Number(doses) || 0));
  const summary = summarizeCost(costs, n, null);
  const lineErr = lines.length ? validateLines(lines) : null;
  const canSave = !!patient && lines.length > 0 && !lineErr && n >= 1 && !pending;

  const payload = JSON.stringify({
    patientId: patient?.id,
    doses: n,
    issuedOn,
    instructions,
    advice,
    lines: lines.map((l) => ({ ...l, note: l.note || null })),
  });

  return (
    <form action={action} className="space-y-5" data-testid="prescribe-form">
      <input type="hidden" name="payload" value={payload} />

      <PatientPicker patient={patient} onChange={setPatient} />

      <section className="card space-y-3">
        <h2 className="font-serif text-lg font-bold">2. 选药</h2>
        <HerbPicker index={index} onPick={(p) => setPicked(p)} chosenIds={new Set(lines.map((l) => l.herbId))} />
        {picked && (
          <LineEditor
            key={`${picked.entry.id}-${picked.choice?.id ?? ""}`}
            picked={picked}
            existing={lines.find((l) => l.herbId === (picked.choice ?? picked.entry).id) ?? null}
            onDone={(line) => {
              setLines((ls) => upsertLine(ls, line));
              setPicked(null);
            }}
            onCancel={() => setPicked(null)}
          />
        )}
      </section>

      <section className="card space-y-2">
        <div className="flex items-baseline justify-between">
          <h2 className="font-serif text-lg font-bold">3. 处方</h2>
          <span className="text-sm text-muted">{lines.length} 味 · 每副 {lines.reduce((s, l) => s + l.grams, 0)} g</span>
        </div>
        {!lines.length ? (
          <p className="text-sm text-muted">还没有药。用上面的首字母按钮或搜索添加。</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="data-table" data-testid="rx-lines">
              <thead>
                <tr><th>药材</th><th className="text-right">克数</th><th>脚注 / 备注</th><th className="text-right">每副成本</th><th /></tr>
              </thead>
              <tbody>
                {lines.map((l, i) => (
                  <tr key={l.herbId} data-testid={`line-${l.name}`}>
                    <td className="font-medium">{l.name}</td>
                    <td className="text-right">{l.grams} g</td>
                    <td className="text-muted whitespace-normal">{[l.prep, l.note].filter(Boolean).join("；") || "—"}</td>
                    <td className="text-right" data-testid={`line-cost-${l.name}`}>{costs[i].cost_per_dose === null ? <span className="text-cinnabar">无进货价</span> : money(costs[i].cost_per_dose)}</td>
                    <td className="text-right">
                      <button type="button" className="px-1 text-muted" aria-label={`${l.name} 上移`} onClick={() => setLines((ls) => moveLine(ls, l.herbId, -1))}>↑</button>
                      <button type="button" className="px-1 text-muted" aria-label={`${l.name} 下移`} onClick={() => setLines((ls) => moveLine(ls, l.herbId, 1))}>↓</button>
                      <button
                        type="button"
                        className="px-1 text-sm underline"
                        onClick={() => {
                          const base = index.entries.find((e) => e.id === l.herbId || e.variants.some((v) => v.id === l.herbId))!;
                          setPicked({ entry: base, choice: base.id === l.herbId ? null : base.variants.find((v) => v.id === l.herbId)! });
                        }}
                      >
                        改
                      </button>
                      <button type="button" className="px-1 text-sm text-cinnabar underline" onClick={() => setLines((ls) => removeLine(ls, l.herbId))}>删</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {lineErr && <p className="text-sm text-cinnabar">{lineErr}</p>}
        {lines.length > 0 && (
          <p className="rounded-lg bg-paper p-2 text-sm" data-testid="cost-summary">
            <span className="text-xs text-muted">成本（按进货价，只有你看得到，不会发给病人）：</span>
            每副 <b>{money(summary.perDose)}</b> · {n} 剂共 <b>{money(summary.total)}</b>
            {summary.missing.length > 0 && <span className="ml-1 text-cinnabar">（不含没有进货价的：{summary.missing.join("、")}）</span>}
          </p>
        )}
      </section>

      <section className="card grid grid-cols-2 gap-3">
        <div>
          <label className="label" htmlFor="doses">剂数</label>
          <input id="doses" type="number" min={1} max={60} step={1} value={doses} onChange={(e) => setDoses(e.target.value)} className="input" />
        </div>
        <div>
          <label className="label" htmlFor="issued_on">日期</label>
          <input id="issued_on" type="date" value={issuedOn} onChange={(e) => setIssuedOn(e.target.value)} className="input" />
        </div>
        <div className="col-span-2">
          <label className="label" htmlFor="instructions">煎服法</label>
          <input id="instructions" maxLength={200} value={instructions} onChange={(e) => setInstructions(e.target.value)} className="input" />
        </div>
        <div className="col-span-2">
          <label className="label" htmlFor="advice">医嘱（可选）</label>
          <textarea id="advice" rows={2} maxLength={500} value={advice} onChange={(e) => setAdvice(e.target.value)} placeholder="如：忌生冷辛辣" className="input" />
        </div>
      </section>

      {state.error && <p className="text-sm text-cinnabar">{state.error}</p>}
      <button disabled={!canSave} className="btn-primary w-full py-3">
        {pending ? "保存中…" : !patient ? "先选一个病人" : !lines.length ? "先加药" : "保存并生成消息"}
      </button>
      <p className="text-center text-xs text-muted">保存后，处方存在 {patient ? patientLabel(patient) : "病人"} 名下，并生成可以直接粘贴到微信的消息（{clinicName}）。</p>
    </form>
  );
}

// ---------------------------------------------------------------------------
function PatientPicker({ patient, onChange }: { patient: Patient | null; onChange: (p: Patient | null) => void }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Patient[]>([]);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ name: "", phone: "", notes: "" });
  const [error, setError] = useState<string | null>(null);
  const [existing, setExisting] = useState<Patient | null>(null);
  const [busy, startTransition] = useTransition();
  // 选定病人时把搜索/新建的状态都清掉，下次「换一个」从搜索开始
  const select = (p: Patient) => {
    setCreating(false);
    setError(null);
    setExisting(null);
    setForm({ name: "", phone: "", notes: "" });
    setQ("");
    onChange(p);
  };

  useEffect(() => {
    if (patient) return;
    const t = setTimeout(() => startTransition(async () => setResults(await searchPatients(q))), 200);
    return () => clearTimeout(t);
  }, [q, patient]);

  if (patient)
    return (
      <section className="card flex items-center justify-between gap-2" data-testid="selected-patient">
        <div>
          <div className="text-xs text-muted">1. 病人</div>
          <div className="font-serif text-lg font-bold">{patient.name || "（没填名字）"}</div>
          <div className="text-sm text-muted">{patient.phone ?? "没填电话"}</div>
        </div>
        <button type="button" onClick={() => onChange(null)} className="btn-ghost">换一个</button>
      </section>
    );

  return (
    <section className="card space-y-3">
      <h2 className="font-serif text-lg font-bold">1. 选病人</h2>
      {!creating ? (
        <>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="输入名字或电话（可以只输后几位）" aria-label="搜病人" className="input" />
          <ul className="divide-y divide-line rounded-lg border border-line" data-testid="patient-results">
            {results.length === 0 && <li className="p-3 text-sm text-muted">{busy ? "搜索中…" : q ? "没找到" : "还没有病人"}</li>}
            {results.map((p) => (
              <li key={p.id}>
                <button type="button" onClick={() => select(p)} className="flex w-full justify-between p-3 text-left text-sm hover:bg-paper" data-testid="patient-result">
                  <span className="font-medium">{p.name || "（没填名字）"}</span>
                  <span className="text-muted">{p.phone ?? ""}</span>
                </button>
              </li>
            ))}
          </ul>
          <button type="button" onClick={() => { setCreating(true); setForm({ name: /\d/.test(q) ? "" : q, phone: /\d/.test(q) ? q : "", notes: "" }); }} className="btn-ghost w-full">
            ＋ 新病人
          </button>
        </>
      ) : (
        <div className="grid grid-cols-2 gap-2" data-testid="new-patient">
          <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="名字" aria-label="病人姓名" maxLength={50} className="input" />
          <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="电话" aria-label="病人电话" maxLength={30} inputMode="tel" className="input" />
          <input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="备注（可选）" aria-label="病人备注" className="input col-span-2" />
          {error && (
            <p className="col-span-2 text-sm text-cinnabar">
              {error}
              {existing && (
                <button type="button" className="ml-2 underline" onClick={() => select(existing)}>
                  就用这个病人
                </button>
              )}
            </p>
          )}
          <button
            type="button"
            disabled={busy}
            className="btn-primary"
            onClick={() =>
              startTransition(async () => {
                const r = await createPatient(form);
                setError(r.error ?? null);
                setExisting(r.existing ?? null);
                if (r.patient) select(r.patient);
              })
            }
          >
            保存病人
          </button>
          <button type="button" onClick={() => { setCreating(false); setError(null); }} className="btn-ghost">取消</button>
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
function HerbPicker({ index, onPick, chosenIds }: { index: HerbIndex; onPick: (p: Picked) => void; chosenIds: Set<string> }) {
  const [letter, setLetter] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [variantsOf, setVariantsOf] = useState<HerbEntry | null>(null);
  const [extra, setExtra] = useState<HerbEntry[]>([]);
  const [adding, startAdding] = useTransition();
  const [addErr, setAddErr] = useState<string | null>(null);

  const allEntries = [...index.entries, ...extra];
  const list = q.trim() ? searchHerbs({ ...index, entries: allEntries }, q, 30) : letter ? [...(index.groups[letter] ?? []), ...extra.filter((e) => letterOfEntry(e) === letter)] : [];

  const pick = (p: Picked) => {
    setVariantsOf(null);
    setQ(""); // 选完清空搜索，方便接着选下一味
    onPick(p);
  };
  const choose = (e: HerbEntry) => {
    if (e.variants.length) setVariantsOf(e);
    else pick({ entry: e, choice: null });
  };
  const used = (e: HerbEntry) => chosenIds.has(e.id) || e.variants.some((v) => chosenIds.has(v.id));

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1" role="toolbar" aria-label="拼音首字母">
        {index.letters.map((l) => (
          <button
            key={l}
            type="button"
            onClick={() => {
              // 点字母总是打开这个字母（不做「再点一次收起」，医生连续选同一字母的药时不会误关）
              setLetter(l);
              setQ("");
              setVariantsOf(null);
            }}
            aria-pressed={letter === l}
            data-testid={`letter-${l}`}
            className={`h-9 w-9 rounded-lg border text-sm font-medium ${letter === l ? "border-cinnabar bg-cinnabar text-white" : "border-line bg-card hover:border-cinnabar"}`}
          >
            {l}
          </button>
        ))}
      </div>
      <input value={q} onChange={(e) => { setQ(e.target.value); setVariantsOf(null); }} placeholder="或者直接搜：汉字、拼音、首字母（如 hq = 黄芪）" aria-label="搜药材" className="input" />

      {(letter || q.trim()) && (
        <div className="rounded-lg border border-line p-2" data-testid="letter-panel">
          <div className="mb-1 text-xs text-muted">{q.trim() ? `搜「${q.trim()}」` : `${letter} 开头`}：{list.length} 味</div>
          <div className="flex flex-wrap gap-2">
            {list.map((e) => (
              <button
                key={e.id}
                type="button"
                onClick={() => choose(e)}
                data-testid={`herb-${e.name}`}
                className={`rounded-full border px-3 py-1 text-sm ${variantsOf?.id === e.id ? "border-cinnabar text-cinnabar" : used(e) ? "border-jade text-jade" : "border-line hover:border-cinnabar"}`}
                title={e.pinyin}
              >
                {e.name}
                {e.variants.length > 0 && <span className="ml-1 text-xs text-muted">+{e.variants.length}</span>}
              </button>
            ))}
            {canAddHerb(q, list) && (
              <button
                type="button"
                disabled={adding}
                onClick={() =>
                  startAdding(async () => {
                    const r = await addHerb(q);
                    setAddErr(r.error ?? null);
                    if (r.id) {
                      const e: HerbEntry = { id: r.id, name: r.name!, pinyin: "", initials: "", variants: [] };
                      setExtra((xs) => [...xs, e]);
                      choose(e);
                    }
                  })
                }
                className="rounded-full border border-dashed border-line px-3 py-1 text-sm text-muted"
              >
                ＋ 新增「{q.trim()}」
              </button>
            )}
          </div>
          {addErr && <p className="mt-1 text-sm text-cinnabar">{addErr}</p>}
        </div>
      )}

      {variantsOf && (
        <div className="rounded-lg bg-paper p-2" data-testid="variant-chooser">
          <div className="mb-1 text-xs text-muted">{variantsOf.name} 有炮制品，选一个：</div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => pick({ entry: variantsOf, choice: null })} data-testid={`variant-${variantsOf.name}`} className="rounded-full border border-cinnabar bg-card px-3 py-1 text-sm">
              {variantsOf.name}（生 / 原药材）
            </button>
            {variantsOf.variants.map((v) => (
              <button key={v.id} type="button" onClick={() => pick({ entry: variantsOf, choice: v })} data-testid={`variant-${v.name}`} className="rounded-full border border-cinnabar bg-card px-3 py-1 text-sm">
                {v.name}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

const letterOfEntry = (e: HerbEntry) => (e.pinyin[0] ?? "#").toUpperCase();

// ---------------------------------------------------------------------------
function LineEditor({ picked, existing, onDone, onCancel }: { picked: Picked; existing: RxLine | null; onDone: (l: RxLine) => void; onCancel: () => void }) {
  const herb = picked.choice ?? { id: picked.entry.id, name: picked.entry.name };
  const [grams, setGrams] = useState(existing ? String(existing.grams) : "");
  const [prep, setPrep] = useState(existing?.prep ?? "");
  const [note, setNote] = useState(existing?.note ?? "");
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => ref.current?.focus(), []);
  const g = Number(grams);
  const ok = g > 0;
  const done = () => ok && onDone({ herbId: herb.id, name: herb.name, grams: g, prep: prep || null, note: note.trim() || null });

  return (
    <div className="space-y-2 rounded-lg border-2 border-cinnabar p-3" data-testid="line-editor">
      <div className="flex items-baseline justify-between">
        <span className="font-serif text-xl font-bold">{herb.name}</span>
        {existing && <span className="text-xs text-muted">已在处方里，修改后点「更新」</span>}
      </div>
      <div className="flex flex-wrap gap-1">
        {COMMON_GRAMS.map((c) => (
          <button key={c} type="button" onClick={() => setGrams(String(c))} className={`rounded-md border px-2 py-1 text-sm ${Number(grams) === c ? "border-cinnabar text-cinnabar" : "border-line"}`}>
            {c}g
          </button>
        ))}
      </div>
      <div className="grid grid-cols-[6rem_7rem_1fr] gap-2">
        <input
          ref={ref}
          type="number"
          min={0}
          step="0.5"
          value={grams}
          onChange={(e) => setGrams(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); done(); } }}
          placeholder="克"
          aria-label="克数"
          className="input"
        />
        <select value={prep} onChange={(e) => setPrep(e.target.value)} aria-label="脚注" className="input px-1">
          <option value="">脚注 —</option>
          {SPECIAL_PREPS.map((p) => <option key={p}>{p}</option>)}
        </select>
        <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} placeholder="备注（可选，如：打碎、另包）" aria-label="备注" className="input" />
      </div>
      <div className="flex gap-2">
        <button type="button" disabled={!ok} onClick={done} className="btn-primary">{existing ? "更新" : "加入处方"}</button>
        <button type="button" onClick={onCancel} className="btn-ghost">取消</button>
      </div>
    </div>
  );
}
