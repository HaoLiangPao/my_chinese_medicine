import Link from "next/link";
import { getOptionalContext } from "@/lib/auth";

const HOME = [
  { href: "/prescriptions", label: "药方" },
  { href: "/inventory", label: "药柜" },
  { href: "/purchases", label: "采购" },
  { href: "/prices", label: "比价" },
  { href: "/herbs", label: "药材" },
  { href: "/learn", label: "学堂" },
];
const CLINIC = [
  { href: "/clinic/prescribe", label: "开方" },
  { href: "/clinic/patients", label: "病人" },
  { href: "/prescriptions", label: "处方" },
  { href: "/inventory", label: "库存" },
  { href: "/purchases", label: "进货" },
  { href: "/prices", label: "比价" },
  { href: "/learn", label: "学堂" },
];

function Bar({ items, badge }: { items: { href: string; label: string }[]; badge?: string }) {
  return (
    <nav className="mx-auto flex max-w-4xl items-center gap-1 overflow-x-auto px-4 py-3" data-testid="nav">
      <Link href="/" className="mr-1 shrink-0 font-serif text-xl font-bold text-cinnabar">
        药柜
      </Link>
      {badge && (
        <span className="mr-2 shrink-0 rounded-full bg-cinnabar px-2 py-0.5 text-xs text-white" data-testid="clinic-badge">
          {badge}
        </span>
      )}
      {items.map((n) => (
        <Link key={n.href} href={n.href} className="shrink-0 rounded-md px-3 py-1.5 text-sm hover:bg-card">
          {n.label}
        </Link>
      ))}
    </nav>
  );
}

export async function Nav() {
  const ctx = await getOptionalContext();
  if (ctx?.kind === "clinic") return <Bar items={CLINIC} badge={ctx.name} />;
  return <Bar items={HOME} />;
}
