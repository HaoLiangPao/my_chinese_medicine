import Link from "next/link";
import { Fragment } from "react";
import { getOptionalContext } from "@/lib/auth";
import { NavIcon, type IconName } from "./nav-icons";

type Item = { href: string; label: string; icon: IconName };

const HOME: Item[] = [
  { href: "/prescriptions", label: "药方", icon: "rx" },
  { href: "/inventory", label: "药柜", icon: "cabinet" },
  { href: "/purchases", label: "采购", icon: "basket" },
  { href: "/prices", label: "比价", icon: "scale" },
  { href: "/herbs", label: "药材", icon: "leaf" },
  { href: "/learn", label: "学堂", icon: "book" },
];
// 诊所没有比价（docs/design/0008 §4.1）
const CLINIC: Item[] = [
  { href: "/clinic/prescribe", label: "开方", icon: "brush" },
  { href: "/clinic/patients", label: "病人", icon: "person" },
  { href: "/prescriptions", label: "处方", icon: "rx" },
  { href: "/inventory", label: "库存", icon: "cabinet" },
  { href: "/purchases", label: "进货", icon: "basket" },
  { href: "/learn", label: "学堂", icon: "book" },
];

function Bar({ items, badge }: { items: Item[]; badge?: string }) {
  return (
    <nav className="mx-auto flex max-w-4xl items-center gap-1 overflow-x-auto px-4 py-2" data-testid="nav">
      <Link href="/" className="mr-1 shrink-0 font-serif text-xl font-bold text-cinnabar">
        药柜
      </Link>
      {badge && (
        <span className="mr-2 shrink-0 rounded-full bg-cinnabar px-2 py-0.5 text-xs text-white" data-testid="clinic-badge">
          {badge}
        </span>
      )}
      {items.map((n, i) => (
        <Fragment key={n.href}>
          {i > 0 && <span aria-hidden="true" className="h-5 w-px shrink-0 bg-line" data-testid="nav-sep" />}
          <Link
            href={n.href}
            className="flex shrink-0 flex-col items-center gap-0.5 rounded-md px-2.5 py-1 text-xs hover:bg-card sm:flex-row sm:gap-1.5 sm:px-3 sm:py-1.5 sm:text-sm"
          >
            <NavIcon name={n.icon} />
            {n.label}
          </Link>
        </Fragment>
      ))}
    </nav>
  );
}

export async function Nav() {
  const ctx = await getOptionalContext();
  if (ctx?.kind === "clinic") return <Bar items={CLINIC} badge={ctx.name} />;
  if (ctx && !ctx.kind) return <Bar items={[]} />; // 还没选账号类型（选择页）
  return <Bar items={HOME} />;
}
