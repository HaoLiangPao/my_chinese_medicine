import type { SupabaseClient, User } from "@supabase/supabase-js";
import { ConfirmButton } from "@/components/confirm-button";
import { signOut } from "./login/actions";
import { InviteForm } from "./member-form";
import { acceptInvitation, declineInvitation, leaveWorkspace, removeMember, revokeInvitation, switchWorkspace } from "./actions";

type Member = { user_id: string; email: string; role: string };
type Incoming = { id: string; workspace_name: string; invited_by_email: string | null };
type Ws = { workspace_id: string; name: string; role: string; is_active: boolean };

/** 总览页底部：收到的邀请、家庭成员、发出的邀请、切换药柜 */
export async function Family({ supabase, user, workspaceId }: { supabase: SupabaseClient; user: User; workspaceId: string }) {
  const [{ data: m }, { data: inc }, { data: sent }, { data: wss }] = await Promise.all([
    supabase.rpc("list_members", { ws: workspaceId }),
    supabase.rpc("my_invitations"),
    supabase.from("invitations").select("id, email").eq("workspace_id", workspaceId).eq("status", "pending").order("created_at"),
    supabase.rpc("my_workspaces"),
  ]);
  const members = (m ?? []) as Member[];
  const incoming = (inc ?? []) as Incoming[];
  const workspaces = (wss ?? []) as Ws[];
  const me = members.find((x) => x.user_id === user.id);
  const isOwner = me?.role === "owner";

  return (
    <>
      {incoming.length > 0 && (
        <section className="card space-y-2 border-cinnabar" data-testid="incoming-invites">
          <h2 className="font-serif text-lg font-bold">收到的邀请</h2>
          {incoming.map((i) => (
            <div key={i.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <span>
                {i.invited_by_email ?? "有人"} 邀请你加入「{i.workspace_name}」
              </span>
              <span className="flex gap-2">
                <form action={acceptInvitation}>
                  <input type="hidden" name="id" value={i.id} />
                  <button className="btn-primary py-1">接受</button>
                </form>
                <form action={declineInvitation}>
                  <input type="hidden" name="id" value={i.id} />
                  <button className="btn-ghost py-1">拒绝</button>
                </form>
              </span>
            </div>
          ))}
          <p className="text-xs text-muted">接受后你记录的药方、库存都会和对方共享。</p>
        </section>
      )}

      <section className="card space-y-3" data-testid="family">
        <div className="flex items-center justify-between">
          <h2 className="font-serif text-lg font-bold">家庭成员</h2>
          <form action={signOut}>
            <button className="text-sm text-muted underline">退出登录 {user.email}</button>
          </form>
        </div>
        <ul className="space-y-1 text-sm" data-testid="member-list">
          {members.map((x) => (
            <li key={x.user_id} className="flex items-center justify-between">
              <span>
                {x.email} <span className="text-xs text-muted">{x.role === "owner" ? "创建者" : "成员"}</span>
              </span>
              {isOwner && x.user_id !== user.id && (
                <form action={removeMember}>
                  <input type="hidden" name="user_id" value={x.user_id} />
                  <ConfirmButton message={`把 ${x.email} 移出这个药柜？`} className="text-xs text-muted underline">移除</ConfirmButton>
                </form>
              )}
            </li>
          ))}
        </ul>

        {isOwner ? (
          <>
            <InviteForm />
            {(sent ?? []).length > 0 && (
              <ul className="space-y-1 text-sm text-muted" data-testid="sent-invites">
                {(sent ?? []).map((s) => (
                  <li key={s.id} className="flex items-center justify-between">
                    <span>已邀请 {s.email}，等待对方接受</span>
                    <form action={revokeInvitation}>
                      <input type="hidden" name="id" value={s.id} />
                      <button className="text-xs underline">撤销</button>
                    </form>
                  </li>
                ))}
              </ul>
            )}
          </>
        ) : (
          <form action={leaveWorkspace}>
            <input type="hidden" name="workspace_id" value={workspaceId} />
            <ConfirmButton message="退出这个共享药柜？之后就看不到这里的数据了。" className="text-sm text-muted underline">退出这个药柜</ConfirmButton>
          </form>
        )}

        {workspaces.length > 1 && (
          <div className="border-t border-line pt-3 text-sm" data-testid="workspace-switcher">
            <span className="text-muted">你在 {workspaces.length} 个药柜里：</span>
            {workspaces.map((w) =>
              w.is_active ? (
                <span key={w.workspace_id} className="ml-2 font-medium text-cinnabar">{w.name}（当前）</span>
              ) : (
                <form key={w.workspace_id} action={switchWorkspace} className="ml-2 inline">
                  <input type="hidden" name="workspace_id" value={w.workspace_id} />
                  <button className="underline">切换到 {w.name}</button>
                </form>
              ),
            )}
          </div>
        )}
      </section>
    </>
  );
}
