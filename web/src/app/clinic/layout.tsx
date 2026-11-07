import { requireAccountKind } from "@/lib/auth";

/** 诊所页面只给诊所账号（docs/design/0008 §4.2）。放在布局里，在流式渲染之前判断，返回真正的 404。 */
export default async function ClinicLayout({ children }: LayoutProps<"/clinic">) {
  await requireAccountKind("clinic");
  return children;
}
