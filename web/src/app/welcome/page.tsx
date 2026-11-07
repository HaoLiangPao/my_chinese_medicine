import { redirect } from "next/navigation";
import { Suspense } from "react";
import { getSignedInUser } from "@/lib/auth";
import { isAccountKind } from "@/lib/terms";
import { Loading } from "@/components/ui";
import { WelcomeForm } from "./welcome-form";

/** 还没选账号类型的用户（旧账号、需要邮箱确认的新账号）在这里选一次 */
export default function WelcomePage({ searchParams }: PageProps<"/welcome">) {
  return (
    <div className="mx-auto mt-6 max-w-md">
      <h1 className="mb-1 font-serif text-2xl font-bold">选择账号类型</h1>
      <p className="mb-5 text-sm text-muted">病人和医生用的页面、用语都不一样。选一次就好。</p>
      <Suspense fallback={<Loading />}>
        <Choose searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

type Ws = { kind: string; name: string };

async function Choose({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { retry } = await searchParams;
  const { supabase, user, current } = await getSignedInUser();
  if (current?.account_kind) redirect("/");
  // 还没选类型时 my_workspaces 返回全部（旧账号可能两种都有）
  const { data } = await supabase.rpc("my_workspaces");
  const workspaces = (data ?? []) as Ws[];
  const clinics = workspaces.filter((w) => w.kind === "clinic");
  const households = workspaces.filter((w) => w.kind === "household");
  const meta = user.user_metadata ?? {};
  return (
    <WelcomeForm
      email={user.email ?? ""}
      retry={retry === "1"}
      defaultKind={isAccountKind(meta.account_kind) ? meta.account_kind : null}
      defaultClinicName={typeof meta.clinic_name === "string" ? meta.clinic_name : null}
      hasClinic={clinics.length > 0}
      hasBoth={clinics.length > 0 && households.length > 0}
    />
  );
}
