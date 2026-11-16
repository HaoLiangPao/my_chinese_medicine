import Link from "next/link";
import { getContext } from "@/lib/auth";
import { termsFor } from "@/lib/terms";
import { catalogLines, newSeed, pickAction, shuffle } from "@/lib/apprentice";
import { ApprenticeTalk } from "./talk";
import { RandomHerbForm } from "./random-herb";

/** 药材目录页的小学徒（docs/design/0019 §5）：站在药柜前随机做一个动作，旁边「随便翻一味」 */
export async function ApprenticeCorner() {
  const { supabase, workspaceId, accountKind } = await getContext();
  const [{ count: catalogSize }, { count: inStock }] = await Promise.all([
    supabase.from("herbs").select("id", { count: "exact", head: true }).not("category", "is", null),
    supabase.from("v_inventory").select("herb_id", { count: "exact", head: true }).eq("workspace_id", workspaceId).gt("on_hand_grams", 0),
  ]);
  const seed = newSeed();
  return (
    <section className="card" data-testid="apprentice-corner">
      <ApprenticeTalk action={pickAction(seed)} lines={shuffle(catalogLines(catalogSize ?? 0), seed + 1)} size="md">
        <RandomHerbForm stock={termsFor(accountKind).stock} hasStock={(inStock ?? 0) > 0} />
        <Link href="/herbs/apprentice" className="mt-1 inline-block text-xs text-muted underline" data-bug-label="认识小学徒">
          认识小学徒 →
        </Link>
      </ApprenticeTalk>
    </section>
  );
}
