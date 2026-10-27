import Link from "next/link";
import type { ReactNode } from "react";

export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: { href: string; label: string };
}) {
  return (
    <div className="mb-5 flex items-end justify-between gap-3">
      <div>
        <h1 className="font-serif text-2xl font-bold">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
      </div>
      {action && (
        <Link href={action.href} className="btn-primary shrink-0">
          {action.label}
        </Link>
      )}
    </div>
  );
}

export function Loading() {
  return <div className="card animate-pulse text-sm text-muted">加载中…</div>;
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="card text-center text-sm text-muted">{children}</div>;
}

export function Stat({ label, value, href }: { label: string; value: ReactNode; href?: string }) {
  const body = (
    <div className="card">
      <div className="text-xs text-muted">{label}</div>
      <div className="mt-1 font-serif text-2xl font-bold">{value}</div>
    </div>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}
