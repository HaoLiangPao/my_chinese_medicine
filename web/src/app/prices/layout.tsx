import { requireAccountKind } from "@/lib/auth";

/** 比价只给家庭账号（诊所先不要，docs/design/0008 §4.2） */
export default async function PricesLayout({ children }: LayoutProps<"/prices">) {
  await requireAccountKind("household");
  return children;
}
