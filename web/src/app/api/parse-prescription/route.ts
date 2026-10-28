import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { matchNames } from "@/lib/herbs";
import { callOpenRouter, modelList, withFallback, type Parsed } from "@/lib/ai-parse";

export type ParseResponse =
  | {
      photo_path: string;
      result: Omit<Parsed, "items"> & {
        items: (Parsed["items"][number] & { matched_name: string | null })[];
      };
    }
  | { error: string; photo_path?: string };

// 最多试两个模型，每个 60 秒超时
export const maxDuration = 150;

const ALLOWED_TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "未登录" }, { status: 401 });
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "服务器没有配置 OPENROUTER_API_KEY" }, { status: 500 });

  const form = await req.formData();
  const photo = form.get("photo");
  if (!(photo instanceof Blob)) return NextResponse.json({ error: "没有收到照片" }, { status: 400 });
  if (photo.size > 5 * 1024 * 1024) return NextResponse.json({ error: "照片太大（>5MB）" }, { status: 413 });
  const ext = ALLOWED_TYPES[photo.type];
  if (!ext) return NextResponse.json({ error: "只支持 JPEG / PNG / WebP 图片" }, { status: 415 });

  // 每人每天的识别次数上限（防止 API 额度被刷）
  const limit = Number(process.env.PARSE_DAILY_LIMIT ?? 30);
  const { data: allowed, error: quotaErr } = await supabase.rpc("consume_parse_quota", { p_limit: limit });
  if (quotaErr) return NextResponse.json({ error: quotaErr.message }, { status: 500 });
  if (!allowed) return NextResponse.json({ error: `今天的识别次数已用完（每天 ${limit} 次），可以手动录入` }, { status: 429 });

  const { data: ws, error: wsErr } = await supabase.rpc("ensure_default_workspace");
  if (wsErr) return NextResponse.json({ error: wsErr.message }, { status: 500 });

  const bytes = Buffer.from(await photo.arrayBuffer());
  const mediaType = photo.type;

  // 1) 存照片（私有 bucket，路径以 workspace_id 开头，RLS 依此判断）
  const photoPath = `${ws}/${crypto.randomUUID()}.${ext}`;
  const { error: upErr } = await supabase.storage
    .from("prescription-photos")
    .upload(photoPath, bytes, { contentType: mediaType });
  if (upErr) return NextResponse.json({ error: `照片上传失败：${upErr.message}` }, { status: 500 });

  // 2) 让模型读方子：按 OPENROUTER_MODELS 的顺序试，前一个失败（限流、超时、格式不对）就换下一个
  try {
    const { value: parsed, model, failed } = await withFallback(modelList(process.env.OPENROUTER_MODELS), (model) =>
      callOpenRouter({
        baseUrl: process.env.OPENROUTER_BASE_URL ?? "https://openrouter.ai/api/v1",
        apiKey,
        model,
        mediaType,
        base64: bytes.toString("base64"),
      }),
    );
    if (failed.length) console.warn("parse-prescription fallback", { used: model, failed });

    // 3) 和药材目录对一下（含别名）
    const ids = await matchNames(supabase, parsed.items.map((i) => i.name));
    const { data: herbRows } = await supabase
      .from("herbs")
      .select("id, name_zh")
      .in("id", Object.values(ids).filter((v): v is string => !!v));
    const nameById = new Map((herbRows ?? []).map((h) => [h.id, h.name_zh]));

    const body: ParseResponse = {
      photo_path: photoPath,
      result: {
        ...parsed,
        items: parsed.items.map((i) => ({ ...i, matched_name: ids[i.name] ? (nameById.get(ids[i.name]!) ?? null) : null })),
      },
    };
    return NextResponse.json(body);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message, photo_path: photoPath }, { status: 502 });
  }
}
