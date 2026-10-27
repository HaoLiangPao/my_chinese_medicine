import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { matchNames } from "@/lib/herbs";
import { SPECIAL_PREPS } from "@/lib/format";

const Parsed = z.object({
  issued_on: z.string().nullable().describe("开方日期 YYYY-MM-DD；看不清就 null"),
  dose_count: z.number().int().nullable().describe("剂数/副数，如「七剂」「x7」→ 7；没写就 null"),
  patient_name: z.string().nullable().describe("患者姓名，没有就 null"),
  instructions: z.string().nullable().describe("煎服法原文，没有就 null"),
  items: z.array(
    z.object({
      name: z.string().describe("药名，按方子上的写法，用简体中文"),
      grams: z.number().nullable().describe("每副克数；写「钱」的按 1 钱 = 3g 换算；看不清就 null"),
      special_prep: z.enum(SPECIAL_PREPS).nullable().describe("先煎/后下/包煎等脚注，没有就 null"),
    }),
  ),
  notes: z.string().nullable().describe("看不清或不确定的地方，简短说明；没有就 null"),
});

export type ParseResponse =
  | {
      photo_path: string;
      result: Omit<z.infer<typeof Parsed>, "items"> & {
        items: (z.infer<typeof Parsed>["items"][number] & { matched_name: string | null })[];
      };
    }
  | { error: string };

const PROMPT = `这是一张中医药方（可能是手写或打印）。请把上面的内容转成结构化数据。
要求：
- 每一味药一条，按方子上的顺序；
- 克数是「每一副」的用量；
- 不要猜测看不清的字，宁可在 notes 里说明；
- 只转录，不要添加或评价任何药材。`;

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "未登录" }, { status: 401 });
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "服务器没有配置 ANTHROPIC_API_KEY" }, { status: 500 });
  }

  const form = await req.formData();
  const photo = form.get("photo");
  if (!(photo instanceof Blob)) return NextResponse.json({ error: "没有收到照片" }, { status: 400 });
  if (photo.size > 5 * 1024 * 1024) return NextResponse.json({ error: "照片太大（>5MB）" }, { status: 413 });

  const { data: ws, error: wsErr } = await supabase.rpc("ensure_default_workspace");
  if (wsErr) return NextResponse.json({ error: wsErr.message }, { status: 500 });

  const bytes = Buffer.from(await photo.arrayBuffer());
  const mediaType = (photo.type || "image/jpeg") as "image/jpeg" | "image/png" | "image/webp";

  // 1) 存照片（私有 bucket，路径以 workspace_id 开头，RLS 依此判断）
  const photoPath = `${ws}/${crypto.randomUUID()}.jpg`;
  const { error: upErr } = await supabase.storage
    .from("prescription-photos")
    .upload(photoPath, bytes, { contentType: mediaType });
  if (upErr) return NextResponse.json({ error: `照片上传失败：${upErr.message}` }, { status: 500 });

  // 2) 让 Claude 读方子
  try {
    const client = new Anthropic();
    const msg = await client.messages.parse({
      model: process.env.ANTHROPIC_MODEL ?? "claude-sonnet-5-5",
      max_tokens: 4096,
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: mediaType, data: bytes.toString("base64") } },
            { type: "text", text: PROMPT },
          ],
        },
      ],
      output_config: { format: zodOutputFormat(Parsed) },
    });
    const parsed = msg.parsed_output;
    if (!parsed) throw new Error("模型没有返回结构化结果");

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
