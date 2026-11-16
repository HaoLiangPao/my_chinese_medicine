#!/usr/bin/env node
// 药材默认照片（docs/design/0010 §3.5）：从 Wikimedia Commons 找候选图、核对授权、下载、重新编码，生成核对页。
//
//   node scripts/fetch-herb-photos.mjs search [药名...]     # 找候选、下载、处理，生成 .local/herb-photos/review.html
//   node scripts/fetch-herb-photos.mjs choose 麦冬=2 黄芪=1 当归=none --by Hao [--date 2026-11-12]
//                                                          # 记下 Hao 核对的结果，写 supabase/data/herb-photos.json，
//                                                          # 把选中的图放进 web/public/herb-photos/
//   node scripts/fetch-herb-photos.mjs migration supabase/migrations/<时间戳>_herb_photos_<名字>.sql
//                                                          # 把已核对的照片元数据生成一个 migration
//
// 规则：
// - 只用 Commons API（imageinfo + extmetadata）里明确写着公有领域 / CC0 / CC BY / CC BY-SA 的图；不按页面文字判断。
// - 下载的文件是不可信数据：放在 .local/herb-photos/raw/ 下（单独的目录），用 sharp 确认是 JPEG / PNG / WebP，
//   再重新编码成 WebP（去掉 EXIF 等元数据），长边 800px。
// - 只有核对过（choose 记过）的图才进 supabase/data/herb-photos.json 的 photo 和 App。
// 可以重跑：search 会重新找；choose 按候选编号（review.html 上的编号）选，编号以最近一次 search 为准。
import { createRequire } from "node:module";
import { readFileSync, writeFileSync, mkdirSync, existsSync, rmSync, copyFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const work = join(root, ".local/herb-photos");
const rawDir = join(work, "raw");
const processedDir = join(work, "processed");
const candidatesFile = join(work, "candidates.json");
const dataFile = join(root, "supabase/data/herb-photos.json");
const publicDir = join(root, "web/public/herb-photos");

const UA = "my-chinese-medicine-photo-fetch/0.1 (https://github.com/HaoLiangPao/my_chinese_medicine; herb reference photos)";
const API = "https://commons.wikimedia.org/w/api.php";
const MAX_CANDIDATES = 5;
const LONG_EDGE = 800;
const DOWNLOAD_WIDTH = 960; // Commons 的标准缩略图宽度之一

// ---------------------------------------------------------------------------
// 药材目录：seed.sql（标准名、拼音）+ herb-monographs.json（拉丁名、炮制品的原药材）+ 下面的植物学名
// ---------------------------------------------------------------------------

// 基原植物 / 动物 / 矿物（《中国药典》2020 年版一部；多基原的取第一个）。只用来在 Commons 上找图，不显示。
export const SPECIES = {
  麻黄: "Ephedra sinica", 桂枝: "Cinnamomum cassia", 紫苏叶: "Perilla frutescens", 生姜: "Zingiber officinale",
  荆芥: "Schizonepeta tenuifolia", 防风: "Saposhnikovia divaricata", 白芷: "Angelica dahurica", 薄荷: "Mentha haplocalyx",
  桑叶: "Morus alba", 菊花: "Chrysanthemum morifolium", 葛根: "Pueraria montana var. lobata", 柴胡: "Bupleurum chinense",
  升麻: "Actaea cimicifuga", 石膏: "Gypsum", 知母: "Anemarrhena asphodeloides", 栀子: "Gardenia jasminoides",
  黄芩: "Scutellaria baicalensis", 黄连: "Coptis chinensis", 黄柏: "Phellodendron chinense", 关黄柏: "Phellodendron amurense",
  金银花: "Lonicera japonica", 连翘: "Forsythia suspensa", 蒲公英: "Taraxacum mongolicum", 生地黄: "Rehmannia glutinosa",
  玄参: "Scrophularia ningpoensis", 牡丹皮: "Paeonia suffruticosa", 赤芍: "Paeonia lactiflora", 大黄: "Rheum palmatum",
  独活: "Angelica biserrata", 羌活: "Notopterygium incisum", 藿香: "Agastache rugosa", 广藿香: "Pogostemon cablin",
  苍术: "Atractylodes lancea", 厚朴: "Magnolia officinalis", 砂仁: "Amomum villosum", 茯苓: "Wolfiporia cocos",
  猪苓: "Polyporus umbellatus", 泽泻: "Alisma orientale", 薏苡仁: "Coix lacryma-jobi", 车前子: "Plantago asiatica",
  干姜: "Zingiber officinale", 肉桂: "Cinnamomum cassia", 陈皮: "Citrus reticulata", 枳壳: "Citrus aurantium",
  枳实: "Citrus aurantium", 木香: "Aucklandia lappa", 香附: "Cyperus rotundus", 佛手: "Citrus medica var. sarcodactylis",
  山楂: "Crataegus pinnatifida", 神曲: null, 麦芽: "Hordeum vulgare", 鸡内金: null,
  川芎: "Ligusticum chuanxiong", 丹参: "Salvia miltiorrhiza", 桃仁: "Prunus persica", 红花: "Carthamus tinctorius",
  牛膝: "Achyranthes bidentata", 川牛膝: "Cyathula officinalis", 益母草: "Leonurus japonicus", 三七: "Panax notoginseng",
  半夏: "Pinellia ternata", 桔梗: "Platycodon grandiflorus", 川贝母: "Fritillaria cirrhosa", 浙贝母: "Fritillaria thunbergii",
  苦杏仁: "Prunus armeniaca", 酸枣仁: "Ziziphus jujuba var. spinosa", 远志: "Polygala tenuifolia", 龙骨: null,
  牡蛎: "Crassostrea gigas", 天麻: "Gastrodia elata", 钩藤: "Uncaria rhynchophylla", 人参: "Panax ginseng",
  西洋参: "Panax quinquefolius", 党参: "Codonopsis pilosula", 太子参: "Pseudostellaria heterophylla",
  黄芪: "Astragalus membranaceus", 白术: "Atractylodes macrocephala", 山药: "Dioscorea polystachya",
  甘草: "Glycyrrhiza uralensis", 大枣: "Ziziphus jujuba", 当归: "Angelica sinensis", 熟地黄: "Rehmannia glutinosa",
  白芍: "Paeonia lactiflora", 阿胶: null, 何首乌: "Reynoutria multiflora", 龙眼肉: "Dimocarpus longan",
  麦冬: "Ophiopogon japonicus", 天冬: "Asparagus cochinchinensis", 南沙参: "Adenophora tetraphylla",
  北沙参: "Glehnia littoralis", 玉竹: "Polygonatum odoratum", 百合: "Lilium lancifolium", 石斛: "Dendrobium nobile",
  铁皮石斛: "Dendrobium officinale", 枸杞子: "Lycium barbarum", 女贞子: "Ligustrum lucidum", 杜仲: "Eucommia ulmoides",
  续断: "Dipsacus asper", 菟丝子: "Cuscuta chinensis", 淫羊藿: "Epimedium brevicornu", 五味子: "Schisandra chinensis",
  山茱萸: "Cornus officinalis", 莲子: "Nelumbo nucifera", 芡实: "Euryale ferox", 浮小麦: "Triticum aestivum",
};

// Commons 上的中文文件名多用繁体。只列药名里用到、繁简不同的字。
const TRAD = {
  丝: "絲", 乌: "烏", 党: "黨", 关: "關", 参: "參", 叶: "葉", 壳: "殼", 姜: "薑", 实: "實", 广: "廣", 归: "歸", 当: "當",
  怀: "懷", 断: "斷", 术: "朮", 枣: "棗", 栀: "梔", 泻: "瀉", 泽: "澤", 独: "獨", 猪: "豬", 红: "紅", 续: "續", 翘: "翹",
  胶: "膠", 苍: "蒼", 苏: "蘇", 药: "藥", 莲: "蓮", 蛎: "蠣", 贝: "貝", 贞: "貞", 车: "車", 远: "遠", 连: "連", 钩: "鉤",
  铁: "鐵", 银: "銀", 门: "門", 陈: "陳", 风: "風", 鸡: "雞", 麦: "麥", 黄: "黃", 龙: "龍",
};
export const toTraditional = (s) => [...s].map((c) => TRAD[c] ?? c).join("");

// 文件名用拼音（"mai dong" → "mai-dong"），线上、本地的 herbs.id 不一样，不能用 id
export const photoKey = (pinyin) => pinyin.trim().toLowerCase().replace(/[^a-z]+/g, "-");

// "Astragali Radix" → "Radix Astragali"（旧写法，Commons 上的文件名常用）
const PARTS = /^(Radix|Rhizoma|Herba|Fructus|Semen|Cortex|Flos|Folium|Ramulus|Pericarpium|Bulbus|Caulis|Concha|Os|Poria|Polyporus|Massa|Gypsum|Endothelium|Colla|Arillus|Ramulus)$/;
export function latinVariants(latin) {
  if (!latin) return [];
  const words = latin.replace(/\b(Praeparata|cum Melle|et Rhizoma)\b/g, "").trim().split(/\s+/);
  const out = new Set([latin]);
  const i = words.findIndex((w) => PARTS.test(w));
  if (i > 0) out.add([words[i], ...words.slice(0, i), ...words.slice(i + 1)].join(" "));
  if (i === 0 && words.length > 1) out.add([...words.slice(1), words[0]].join(" "));
  return [...out];
}

export function readCatalog() {
  const seed = readFileSync(join(root, "supabase/seed.sql"), "utf8");
  const processedAt = seed.indexOf("base_herb_id");
  const aliasAt = seed.indexOf("herb_aliases");
  const base = [...seed.slice(0, processedAt).matchAll(/\('([^']+)', '([a-z ]+)', '([^']+)'\)/g)].map((m) => ({
    name: m[1], pinyin: m[2], base: null,
  }));
  const processed = [...seed.slice(processedAt, aliasAt).matchAll(/\('([^']+)', '([a-z ]+)', '([^']+)'\)/g)].map((m) => ({
    name: m[1], pinyin: m[2], base: m[3],
  }));
  const { herbs: monographs } = JSON.parse(readFileSync(join(root, "supabase/data/herb-monographs.json"), "utf8"));
  const latin = new Map(monographs.map((m) => [m.name, m.latin ?? null]));
  const herbs = [...base, ...processed].map((h) => ({
    ...h, key: photoKey(h.pinyin), latin: latin.get(h.name) ?? null, species: h.base ? null : SPECIES[h.name] ?? null,
  }));
  if (base.length < 100 || processed.length < 10) throw new Error("seed.sql 的格式变了，解析出来的数量不对");
  const keys = new Set(herbs.map((h) => h.key));
  if (keys.size !== herbs.length) throw new Error("拼音生成的文件名重复了");
  return herbs;
}

// ---------------------------------------------------------------------------
// 授权：只认 extmetadata 里的 License 代码
// ---------------------------------------------------------------------------

export function checkLicense(meta) {
  const v = (k) => (meta?.[k]?.value ?? "").toString().trim();
  const code = v("License").toLowerCase();
  const short = v("LicenseShortName");
  if (v("NonFree") === "true") return { ok: false, reason: "NonFree" };
  if (v("Restrictions")) return { ok: false, reason: `Restrictions: ${v("Restrictions")}` };
  let family = null;
  if (/^(pd|pd-.*|cc-pd.*)$/.test(code) || /^public domain$/i.test(short)) family = "PD";
  else if (/^cc0(-1\.0)?$/.test(code)) family = "CC0";
  else if (/^cc-by-sa-\d(\.\d)?(-[a-z]+)?$/.test(code)) family = "CC BY-SA";
  else if (/^cc-by-\d(\.\d)?(-[a-z]+)?$/.test(code)) family = "CC BY";
  if (!family) return { ok: false, reason: `授权不在白名单：${code || "?"} / ${short || "?"}` };
  const author = htmlToText(v("Artist")) || htmlToText(v("Credit"));
  if ((family === "CC BY" || family === "CC BY-SA") && !author) return { ok: false, reason: "要署名但没有作者" };
  return {
    ok: true, family, license: short || code, licenseUrl: v("LicenseUrl") || null, author: author || null,
    description: htmlToText(v("ImageDescription")).slice(0, 300),
  };
}

export function htmlToText(html) {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#0?39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

// 饮片 / 药材的关键词加分；植物照片其次；标本、插图、商店全景减分
const DRIED = /dried|slice|饮片|飲片|藥材|药材|radix|rhizoma|herba|fructus|semen|cortex|flos|folium|ramulus|pericarpium|crude drug|herbal|中藥|中药|medicine|apothecary|藥|drug/i;
const BAD = /herbari|herbier|illustration|köhler|botanical drawing|map|stamp|logo|museum|shop|store|street|market|panoramio|\.pdf|\.djvu/i;
export function scoreCandidate(herb, text) {
  let s = 0;
  const t = text.toLowerCase();
  if (text.includes(herb.name) || text.includes(toTraditional(herb.name))) s += 4;
  for (const l of latinVariants(herb.latin)) if (t.includes(l.toLowerCase())) s += 4;
  if (herb.species && t.includes(herb.species.toLowerCase().split(" var.")[0])) s += 2;
  if (DRIED.test(text)) s += 3;
  if (BAD.test(text)) s -= 4;
  return s;
}
export const guessKind = (text) => (DRIED.test(text) ? "饮片" : "植物");

// ---------------------------------------------------------------------------
// Commons API
// ---------------------------------------------------------------------------

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function api(params) {
  if (process.env.DEBUG) console.warn(`  api ${params.list ?? params.prop} ${(params.srsearch ?? params.cmtitle ?? params.titles ?? "").slice(0, 60)}`);
  const url = `${API}?${new URLSearchParams({ format: "json", formatversion: "2", ...params })}`;
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(30_000) }).catch((e) => e);
    if (res instanceof Error) {
      if (process.env.DEBUG) console.warn(`  API ${res.message}，再试`);
      continue;
    }
    if (res.status === 429 || res.status >= 500) {
      if (process.env.DEBUG) console.warn(`  API ${res.status}，等一下再试`);
      await sleep(2000 * (attempt + 1));
      continue;
    }
    if (!res.ok) throw new Error(`Commons API ${res.status}`);
    await sleep(150);
    return res.json();
  }
  throw new Error("Commons API 一直失败");
}

async function searchFiles(q, limit = 15) {
  const d = await api({ action: "query", list: "search", srnamespace: "6", srlimit: String(limit), srsearch: `${q} filetype:bitmap` });
  return (d.query?.search ?? []).map((r) => r.title);
}
async function categoryFiles(cat, depth = 1) {
  const d = await api({ action: "query", list: "categorymembers", cmtitle: `Category:${cat}`, cmlimit: "100", cmtype: "file|subcat" });
  const members = d.query?.categorymembers ?? [];
  let files = members.filter((m) => m.ns === 6).map((m) => m.title);
  if (depth > 0) {
    // 只进名字像「干品 / 药用」的子分类
    for (const sub of members.filter((m) => m.ns === 14 && /dried|medic|herbal|drug|root|rhizome|seed|fruit|bark/i.test(m.title))) {
      files = files.concat(await categoryFiles(sub.title.replace(/^Category:/, ""), depth - 1));
    }
  }
  return files;
}
async function imageInfo(titles) {
  const out = new Map();
  for (let i = 0; i < titles.length; i += 40) {
    const d = await api({
      action: "query", prop: "imageinfo", titles: titles.slice(i, i + 40).join("|"),
      iiprop: "url|mime|size|extmetadata|user", iiurlwidth: String(DOWNLOAD_WIDTH),
      iiextmetadatafilter: "License|LicenseShortName|LicenseUrl|Artist|Credit|ImageDescription|Categories|NonFree|Restrictions",
    });
    for (const p of d.query?.pages ?? []) if (p.imageinfo?.[0]) out.set(p.title, p.imageinfo[0]);
  }
  return out;
}

// ---------------------------------------------------------------------------
// 下载和处理（不可信数据）
// ---------------------------------------------------------------------------

function loadSharp() {
  try {
    return createRequire(join(root, "web/package.json"))("sharp");
  } catch {
    console.error("找不到 sharp：先在 web/ 下跑 npm ci（Next.js 自带 sharp）");
    process.exit(1);
  }
}

const MAX_BYTES = 150 * 1024;
// 重新编码成 WebP：sharp 默认不带原图的 EXIF 等元数据；.rotate() 先按 EXIF 方向转正。
// 超过 150KB 先降质量，还不够再缩小
async function encode(sharp, buf) {
  for (const edge of [LONG_EDGE, 640, 520]) {
    const resize = { width: edge, height: edge, fit: "inside", withoutEnlargement: true };
    for (const quality of [78, 70, 62, 54]) {
      const out = await sharp(buf).rotate().resize(resize).webp({ quality }).toBuffer();
      if (out.length <= MAX_BYTES) return out;
    }
  }
  throw new Error("压不到 150KB 以内");
}

async function downloadAndProcess(sharp, url, rawPath, outPath, thumbPath) {
  if (!/^https:\/\/(upload|thumb)\.wikimedia\.org\//.test(url)) throw new Error(`不是 Commons 的图片地址：${url}`);
  const res = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`下载失败 ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > 15 * 1024 * 1024) throw new Error("文件太大");
  writeFileSync(rawPath, buf);
  const meta = await sharp(buf, { limitInputPixels: 50_000_000 }).metadata();
  if (!["jpeg", "png", "webp"].includes(meta.format)) throw new Error(`不是 JPEG / PNG / WebP：${meta.format}`);
  if (!meta.width || !meta.height || meta.width < 300 || meta.height < 200) throw new Error(`图太小：${meta.width}×${meta.height}`);
  const out = await encode(sharp, buf);
  writeFileSync(outPath, out);
  const thumb = await sharp(buf).rotate().resize({ width: 260, height: 260, fit: "inside" }).jpeg({ quality: 70 }).toBuffer();
  writeFileSync(thumbPath, thumb);
  const info = await sharp(out).metadata();
  return { width: info.width, height: info.height, bytes: out.length };
}

// ---------------------------------------------------------------------------
// search
// ---------------------------------------------------------------------------

async function search(args) {
  const sharp = loadSharp();
  const resume = args.includes("--resume"); // 跳过已经找过的（中断后接着跑）
  const only = args.filter((a) => !a.startsWith("--"));
  const previous = existsSync(candidatesFile) ? JSON.parse(readFileSync(candidatesFile, "utf8")) : { herbs: {} };
  const herbs = readCatalog().filter((h) => (!only.length || only.includes(h.name)) && !(resume && previous.herbs[h.name]));
  mkdirSync(rawDir, { recursive: true });
  mkdirSync(processedDir, { recursive: true });

  // 同时找 3 味（Commons API 单个请求有时很慢）
  const queue = [...herbs];
  const worker = async () => {
    for (let herb = queue.shift(); herb; herb = queue.shift()) await searchOne(sharp, herb, previous);
  };
  await Promise.all([worker(), worker(), worker()]);
  writeReviewPage(previous);
  printStats(previous);
}

async function searchOne(sharp, herb, previous) {
    const queries = [herb.name, toTraditional(herb.name), ...latinVariants(herb.latin)];
    if (!herb.base) queries.push(herb.pinyin.replace(/ /g, ""));
    const titles = new Set();
    for (const q of [...new Set(queries)]) for (const t of await searchFiles(`"${q}"`)) titles.add(t);
    if (herb.species) {
      for (const t of await searchFiles(`"${herb.species}" dried`, 10)) titles.add(t);
      for (const t of await categoryFiles(herb.species)) titles.add(t);
    }
    // 大分类里可能有几百张，只看前 160 张（搜索结果在前）
    const infos = await imageInfo([...titles].filter((t) => !/\.(pdf|djvu|tiff?|svg)$/i.test(t)).slice(0, 160));
    const rejected = {};
    const pool = [];
    for (const [title, ii] of infos) {
      if (!["image/jpeg", "image/png", "image/webp"].includes(ii.mime)) continue;
      const lic = checkLicense(ii.extmetadata);
      if (!lic.ok) {
        rejected[lic.reason.split("：")[0]] = (rejected[lic.reason.split("：")[0]] ?? 0) + 1;
        continue;
      }
      const text = `${title} ${lic.description} ${htmlToText(ii.extmetadata?.Categories?.value ?? "")}`;
      const score = scoreCandidate(herb, text);
      if (score < 2) continue; // 和这味药没关系
      pool.push({ title, ii, lic, score, kind: guessKind(text) });
    }
    pool.sort((a, b) => b.score - a.score || a.title.localeCompare(b.title));

    const herbDir = join(rawDir, herb.key);
    rmSync(herbDir, { recursive: true, force: true });
    mkdirSync(herbDir, { recursive: true });
    const candidates = [];
    for (const c of pool) {
      if (candidates.length >= MAX_CANDIDATES) break;
      const n = candidates.length + 1;
      const ext = c.ii.thumbmime === "image/png" || c.ii.mime === "image/png" ? "png" : "jpg";
      try {
        const img = await downloadAndProcess(
          sharp, c.ii.thumburl ?? c.ii.url, join(herbDir, `${n}.${ext}`),
          join(processedDir, `${herb.key}-${n}.webp`), join(processedDir, `${herb.key}-${n}.thumb.jpg`),
        );
        candidates.push({
          n, title: c.title, sourceUrl: c.ii.descriptionurl, author: c.lic.author, license: c.lic.license,
          licenseFamily: c.lic.family, licenseUrl: c.lic.licenseUrl, description: c.lic.description, kind: c.kind,
          score: c.score, ...img,
        });
        await sleep(300);
      } catch (e) {
        console.warn(`\n  跳过 ${c.title}：${e.message}`);
      }
    }
    previous.herbs[herb.name] = { ...herb, candidates, rejected, searchedAt: new Date().toISOString() };
    console.log(`${herb.name}：${candidates.length} 张候选`);
    writeFileSync(candidatesFile, JSON.stringify(previous, null, 2));
}

function printStats(c) {
  const all = readCatalog();
  const found = all.filter((h) => c.herbs[h.name]?.candidates.length);
  const missing = all.filter((h) => !c.herbs[h.name]?.candidates.length);
  const families = {};
  for (const h of found) for (const x of c.herbs[h.name].candidates) families[x.licenseFamily] = (families[x.licenseFamily] ?? 0) + 1;
  console.log(`\n共 ${all.length} 味：${found.length} 味有候选，${missing.length} 味没有（${missing.map((h) => h.name).join("、")}）`);
  console.log(`候选的授权分布：${JSON.stringify(families)}`);
  console.log(`核对页：${join(work, "review.html")}`);
}

// ---------------------------------------------------------------------------
// 核对页：一个自带缩略图的 HTML 文件，选好以后点「生成回复」复制给 Claude
// ---------------------------------------------------------------------------

// 容易认错的药：候选的标题 / 说明里出现这些字样时，核对页上标红提醒
export const CONFUSABLES = {
  茯苓: ["土茯苓", "Smilax", "Smilacis"], 麦冬: ["山麦冬", "Liriope", "沿階草", "Cycas"], 黄柏: ["關黃柏", "关黄柏", "amurense"],
  关黄柏: ["chinense", "川黄柏"], 牛膝: ["川牛膝", "Cyathula"], 川牛膝: ["懷牛膝", "怀牛膝", "Achyranthes"],
  南沙参: ["北沙參", "北沙参", "Glehnia"], 北沙参: ["南沙參", "南沙参", "Adenophora"], 藿香: ["廣藿香", "广藿香", "Pogostemon"],
  广藿香: ["Agastache", "土藿香"], 石斛: ["鐵皮", "铁皮", "officinale"], 铁皮石斛: ["nobile", "金釵"], 川贝母: ["浙貝", "浙贝", "thunbergii"],
  浙贝母: ["川貝", "川贝", "cirrhosa"], 人参: ["西洋參", "西洋参", "quinquefolius", "高麗", "Korean"], 西洋参: ["ginseng"],
  龙骨: ["Water Lift", "dragon boat"], 石膏: ["chart", "Wellcome"], 阿胶: ["Donkey a"],
};
export function confusableHits(name, text) {
  return (CONFUSABLES[name] ?? []).filter((w) => text.toLowerCase().includes(w.toLowerCase()));
}

const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function writeReviewPage(c) {
  const herbs = readCatalog();
  const sections = herbs.map((h) => {
    const entry = c.herbs[h.name];
    const cands = entry?.candidates ?? [];
    const latin = h.latin ? ` · <i>${esc(h.latin)}</i>` : "";
    const species = h.species ? ` · 基原 <i>${esc(h.species)}</i>` : "";
    const base = h.base ? ` · 炮制品，原药材「${esc(h.base)}」` : "";
    const cards = cands.map((x) => {
      const thumb = readFileSync(join(processedDir, `${h.key}-${x.n}.thumb.jpg`)).toString("base64");
      return `<label class="card"><input type="radio" name="${esc(h.name)}" value="${x.n}">
        <img src="data:image/jpeg;base64,${thumb}" alt="">
        <b>${x.n}</b> <span class="kind">${esc(x.kind)}?</span>
        ${confusableHits(h.name, `${x.title} ${x.description}`).map((w) => `<span class="warn">⚠ 出现「${esc(w)}」，可能是易混品</span>`).join("")}
        ${x.description ? `<small class="desc">${esc(x.description.slice(0, 140))}</small>` : ""}
        <small>${esc(x.title.replace(/^File:/, ""))}</small>
        <small>作者：${esc(x.author)}<br>授权：${esc(x.license)}</small>
        <a href="${esc(x.sourceUrl)}" target="_blank" rel="noopener">来源页 ↗</a></label>`;
    });
    const none = `<label class="card none"><input type="radio" name="${esc(h.name)}" value="none"><b>都不对 / 不放</b>
      ${h.base ? "<small>（不选的话用原药材的图）</small>" : ""}</label>`;
    return `<section><h2>${esc(h.name)} <small>${esc(h.pinyin)}${latin}${species}${base}</small></h2>
      <div class="row">${cards.join("") || "<p class='empty'>没找到合适授权的图</p>"}${none}</div></section>`;
  });
  const html = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>药材默认照片核对</title><style>
body{font-family:system-ui,sans-serif;margin:0 auto;max-width:1200px;padding:16px;background:#fafaf7;color:#222}
h1{font-size:22px}h2{font-size:18px;margin:24px 0 8px}h2 small{font-weight:normal;color:#666;font-size:13px}
.row{display:flex;gap:10px;flex-wrap:wrap}.card{display:flex;flex-direction:column;gap:4px;width:200px;padding:8px;border:2px solid #ddd;border-radius:8px;background:#fff;cursor:pointer;font-size:12px}
.card img{width:100%;height:160px;object-fit:contain;background:#eee}.card:has(input:checked){border-color:#2a7}.card.none{justify-content:center;width:120px}
.kind{color:#a60}.warn{color:#c00;font-weight:bold}.desc{color:#777}.empty{color:#999}small{color:#555;word-break:break-all}#out{width:100%;height:44px}
.bar{position:sticky;top:0;background:#fafaf7;padding:8px 0;border-bottom:1px solid #ddd;z-index:1}
</style></head><body>
<h1>药材默认照片核对</h1>
<p>每味药选一张<b>认得对</b>的图（优先饮片 / 干品），不对就选「都不对」。没选的当作还没核对。图片都来自 Wikimedia Commons，授权已用 API 核对过（公有领域 / CC0 / CC BY / CC BY-SA）。
「饮片? / 植物?」是脚本猜的，不对可以在回复里写，比如「麦冬=2 植物」。</p>
<div class="bar"><button onclick="gen()">生成回复</button> 已选 <span id="cnt">0</span> 味。生成以后把下面的文字复制给 Claude。<br>
<textarea id="out" readonly></textarea></div>
${sections.join("\n")}
<script>
function gen(){const picks={};document.querySelectorAll('input[type=radio]:checked').forEach(i=>picks[i.name]=i.value);
document.getElementById('out').value=Object.entries(picks).map(([k,v])=>k+'='+v).join(' ');document.getElementById('cnt').textContent=Object.keys(picks).length}
document.addEventListener('change',()=>{document.getElementById('cnt').textContent=document.querySelectorAll('input[type=radio]:checked').length});
</script></body></html>`;
  writeFileSync(join(work, "review.html"), html);
}

// ---------------------------------------------------------------------------
// choose：记下核对结果
// ---------------------------------------------------------------------------

function readData() {
  if (!existsSync(dataFile)) return { 说明: "", herbs: [] };
  return JSON.parse(readFileSync(dataFile, "utf8"));
}

const DATA_NOTE =
  "药材默认照片（docs/design/0010 §3.5）。由 scripts/fetch-herb-photos.mjs 维护，不要手改。图片在 web/public/herb-photos/<file>，" +
  "来自 Wikimedia Commons，授权用 API 核对过。reviewed = true 的才进数据库、才在 App 里显示；photo = null 表示核对过、没有合适的图。" +
  "kind：饮片 / 药材 / 植物。";

export const thumbFile = (key) => `${key}.thumb.webp`;

async function choose(args) {
  const sharp = loadSharp();
  const by = args[args.indexOf("--by") + 1];
  const date = args.includes("--date") ? args[args.indexOf("--date") + 1] : new Date().toISOString().slice(0, 10);
  if (!args.includes("--by") || !by) throw new Error("要写 --by <核对人>");
  const picks = args.filter((a) => a.includes("="));
  const cands = JSON.parse(readFileSync(candidatesFile, "utf8"));
  const catalog = readCatalog();
  const data = readData();
  const byName = new Map(data.herbs.map((h) => [h.name, h]));
  mkdirSync(publicDir, { recursive: true });

  for (const pick of picks) {
    const [name, value] = pick.split("=");
    const [n, kindOverride] = value.split(/[,:]/);
    const herb = catalog.find((h) => h.name === name);
    if (!herb) throw new Error(`目录里没有「${name}」`);
    let photo = null;
    if (n !== "none") {
      const c = cands.herbs[name]?.candidates.find((x) => String(x.n) === n);
      if (!c) throw new Error(`「${name}」没有第 ${n} 张候选`);
      const file = `${herb.key}.webp`;
      const processed = join(processedDir, `${herb.key}-${n}.webp`);
      if (statSync(processed).size > MAX_BYTES) {
        // 早期版本处理的图可能超过 150KB：从下载的原图重新编码
        const raw = readdirSync(join(rawDir, herb.key)).find((f) => f.startsWith(`${n}.`));
        writeFileSync(processed, await encode(sharp, readFileSync(join(rawDir, herb.key, raw))));
        const m = await sharp(processed).metadata();
        Object.assign(c, { width: m.width, height: m.height });
      }
      copyFileSync(processed, join(publicDir, file));
      // 列表用的小图（96px），免得列表页加载 800px 的大图
      await sharp(join(processedDir, `${herb.key}-${n}.webp`))
        .resize({ width: 96, height: 96, fit: "cover" })
        .webp({ quality: 70 })
        .toFile(join(publicDir, thumbFile(herb.key)));
      photo = {
        file, kind: kindOverride || c.kind, commons_title: c.title, source_url: c.sourceUrl, author: c.author,
        license: c.license, license_url: c.licenseUrl, width: c.width, height: c.height,
      };
    } else {
      rmSync(join(publicDir, `${herb.key}.webp`), { force: true });
      rmSync(join(publicDir, thumbFile(herb.key)), { force: true });
    }
    byName.set(name, { name, photo, reviewed: true, reviewed_by: by, reviewed_at: date });
  }
  // 还没核对的药也列出来（reviewed: false），一眼能看出缺哪些
  for (const h of catalog) if (!byName.has(h.name)) byName.set(h.name, { name: h.name, photo: null, reviewed: false });
  const order = new Map(catalog.map((h, i) => [h.name, i]));
  const herbs = [...byName.values()].sort((a, b) => (order.get(a.name) ?? 1e9) - (order.get(b.name) ?? 1e9));
  writeFileSync(dataFile, JSON.stringify({ 说明: DATA_NOTE, herbs }, null, 2) + "\n");
  const shown = herbs.filter((h) => h.reviewed && h.photo).length;
  const size = readdirSync(publicDir).reduce((s, f) => s + statSync(join(publicDir, f)).size, 0);
  console.log(`已记 ${picks.length} 条。现在 ${shown} 味有已核对的照片，web/public/herb-photos 共 ${(size / 1024).toFixed(0)} KB`);
}

// ---------------------------------------------------------------------------
// migration：已核对的照片元数据
// ---------------------------------------------------------------------------

function migration(out) {
  if (!out || !/supabase\/migrations\/\d{14}_[a-z0-9_]+\.sql$/.test(out)) {
    throw new Error("用法：node scripts/fetch-herb-photos.mjs migration supabase/migrations/<14 位时间戳>_<名字>.sql");
  }
  if (existsSync(out)) throw new Error(`${out} 已经存在。已上线的 migration 不能改，换一个新的时间戳。`);
  const q = (v) => (v === null || v === undefined ? "null" : `'${String(v).replaceAll("'", "''")}'`);
  const rows = readData().herbs.filter((h) => h.reviewed && h.photo);
  for (const h of rows) if (!existsSync(join(publicDir, h.photo.file))) throw new Error(`缺图片文件：${h.photo.file}`);
  const values = rows
    .map((h) => {
      const p = h.photo;
      return `  (${[h.name, p.file, p.kind, p.author, p.license, p.license_url, p.source_url, p.width, p.height, h.reviewed_by, h.reviewed_at].map(q).join(", ")})`;
    })
    .join(",\n");
  const sql = `-- =============================================================================
-- 药材默认照片的元数据（${rows.length} 味）。由 scripts/fetch-herb-photos.mjs migration 生成，不要手改。
-- 来源：supabase/data/herb-photos.json（只取已核对、有照片的）。图片在 web/public/herb-photos/。
-- 设计：docs/design/0010-herb-labels.md §3.5。按药名对应（线上、本地的 herbs.id 不一样）；
-- 已经有的照片会被这里的覆盖（换图时重新生成一个 migration）。目录里没有的药跳过。
-- =============================================================================

insert into public.herb_photos (herb_id, file, kind, author, license, license_url, source_url, width, height, reviewed_by, reviewed_at)
select h.id, v.file, v.kind, v.author, v.license, v.license_url, v.source_url, v.width::int, v.height::int, v.reviewed_by, v.reviewed_at::date
from (values
${values}
) as v(name_zh, file, kind, author, license, license_url, source_url, width, height, reviewed_by, reviewed_at)
join public.herbs h on h.name_zh = v.name_zh
on conflict (herb_id) do update set
  file = excluded.file, kind = excluded.kind, author = excluded.author, license = excluded.license,
  license_url = excluded.license_url, source_url = excluded.source_url, width = excluded.width, height = excluded.height,
  reviewed_by = excluded.reviewed_by, reviewed_at = excluded.reviewed_at;
`;
  writeFileSync(out, sql);
  console.log(`写好 ${out}（${rows.length} 味）`);
}

// ---------------------------------------------------------------------------

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [cmd, ...args] = process.argv.slice(2);
  const run = { search: () => search(args), choose: () => choose(args), migration: () => migration(args[0]), review: () => writeReviewPage(JSON.parse(readFileSync(candidatesFile, "utf8"))) }[cmd];
  if (!run) {
    console.error("用法：search [药名...] | choose 药名=编号|none ... --by <核对人> | migration <文件> | review");
    process.exit(1);
  }
  Promise.resolve(run()).catch((e) => {
    console.error(e.message);
    process.exit(1);
  });
}
