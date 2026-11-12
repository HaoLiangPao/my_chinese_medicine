# 0016 · 药柜（workspaces）不能由客户端直接修改

- 状态：已实现（migration `20261110000019_workspaces_no_client_update.sql`）
- 日期：2026-11-10
- 作者：Hao、Claude

（编号 0014、0015 留给还没合并的 IDEA-5、IDEA-4。）

## 1. 问题

2026-11-10 的只读体检发现：`init` 里的策略

```sql
create policy ws_update on public.workspaces for update using (public.is_member(id));
```

不限列、不限 owner，后面的 migration 没有收紧，`workspaces` 上也没有触发器。任何成员（包括被邀请的家人）用自己的登录 token 直接调 REST `PATCH /workspaces`，就能改这个药柜的 `name` 和 `kind`。

`kind` 被改的后果很重：migration `20261029000010_account_kind`（账号类型，设计见 0008）之后，`is_member` 要求药柜的 `kind` 和账号类型一致。家庭药柜被改成 `clinic`（或者诊所被改成 `household`）以后，所有成员的 `is_member` 都是 false，这个药柜的药方、病人、库存、照片谁都读不到，也改不回来（改回来同样要过 `is_member`），只能进数据库手工修。

### 复现（2026-11-10，本地一次性 Postgres，main 上的 16 条 migration）

Hao 选家庭、录一张药方、邀请 stranger；stranger 选家庭、接受邀请（`role = 'member'`）。然后以 stranger 的身份：

| 操作 | 结果 |
|---|---|
| `update workspaces set name = '被成员改名' where id = <Hao 的药柜>` | 成功，改了 1 行 |
| `update workspaces set kind = 'clinic' where id = <Hao 的药柜>` | 成功，改了 1 行（没有 `with check` 时用 `using` 检查新行，没有拦住） |
| 之后 Hao（owner）`select count(*) from prescriptions` | 0（原来 1） |
| 之后 Hao `is_member(<自己的药柜>)` | false |
| 之后 Hao `select count(*) from workspaces` | 0 |

库里这一行变成了 `被成员改名 / clinic`。

## 2. App 里有没有合法的更新

没有。

- `web/src` 里对 `workspaces` 表只有一处直接访问：药方详情页读诊所名（`prescriptions/[id]/page.tsx`，`select name`）。没有 update。
- 所有 migration 里的函数都没有 `update workspaces`。建药柜（`ensure_default_workspace`、`choose_account_kind`、`create_clinic`）是 insert，清理空药柜（接受邀请、退出时）是 delete，都在 security definer 函数里，以函数所有者的权限执行。
- App 没有「改名」功能：家庭药柜固定叫「我们家」，诊所名在选账号类型时填一次。

## 3. 决定

**直接删掉 `ws_update` 策略，并收回 `anon`、`authenticated` 对 `workspaces` 的表级 UPDATE 权限。** 两层各自都能拦住：

- 没有 UPDATE 策略：RLS 下客户端的 update 改不到任何行；
- 没有 UPDATE 权限：直接报 `permission denied`，以后有人不小心把策略加回来，也还有一层。

没有选「限制为 owner 且只能改 `name`」：现在没有任何功能用它，留着就是一个没有测试、没有界面的写入口。

以后要做「药柜 / 诊所改名」：加一个 security definer 函数（只给 owner、只改 `name`、和 `choose_account_kind` 一样检查长度），不要把策略或 UPDATE 权限加回来。`kind` 任何时候都不由客户端改；账号类型的变更只走 0008 的函数。

### 这次没有动的

- `workspaces` 的 insert / delete：本来就没有对应的策略，RLS 已经全部拒绝，这次不改。
- 其他表的策略：这次只查了 `workspaces`。

## 4. 对线上旧代码的影响

这条 migration 先于新代码上线（0009 §3）。旧代码不受影响：

- 旧代码没有任何地方直接 update `workspaces`（§2），读（`select`）的策略和权限没有动；
- security definer 函数里的 insert / delete 用的是函数所有者的权限，不受 `revoke` 影响；
- 不改任何数据：已有药柜的 `name`、`kind` 原样不动。**如果线上已经有药柜被改过，这条 migration 不会修它**——上线前可以在 Supabase SQL Editor 里查有没有被改过的药柜（正常应该一行都没有；查到了再人工判断）：

  ```sql
  -- owner 的账号类型和药柜类型对不上，或者家庭药柜不叫「我们家」
  select w.id, w.name, w.kind, s.account_kind
  from workspaces w
  join workspace_members m on m.workspace_id = w.id and m.role = 'owner'
  left join user_settings s on s.user_id = m.user_id
  where (s.account_kind is not null and s.account_kind <> w.kind)
     or (w.kind = 'household' and w.name <> '我们家');
  ```

这次没有前端和 server action 的改动。

## 5. 测试

- `supabase/tests/workspaces_readonly_test.sql`：
  - 没有 UPDATE 策略；`anon`、`authenticated` 没有表级和任何一列的 UPDATE 权限；
  - 普通成员改 `kind`、改 `name`、同时改都被拒；owner 改 `kind`、改 `name` 也被拒；不是成员的医生、未登录同样被拒；
  - 之后数据没变，owner 和成员照常读得到药柜和药方；
  - 建药柜（`choose_account_kind`）、接受邀请后清理空药柜照常工作。
- `supabase/tests/upgrade/20261110000019_workspaces_no_client_update.sql`：在有数据的旧库上执行 migration 后，成员改不了，旧代码用到的读（药柜名、`my_workspaces`、药方）照常。
- 反向验证（2026-11-10）：
  - 把 migration 换成空的 → SQL 测试失败（「workspaces 上没有 UPDATE 策略 — expected 0, got 1」），升级测试失败（「成员不能改 kind — expected an error, but statement succeeded」）；
  - 只删策略、不 revoke → SQL 测试失败在权限检查；
  - 只 revoke、不删策略 → SQL 测试失败在策略检查（升级测试只看行为，这种情况它是通过的）。
- 没有加 E2E：没有页面和接口的变化，E2E 全流程（建药柜、邀请、诊所）用来确认旧路径不受影响。

没验证的：本地测试库用 `auth_stub.sql` 模拟 Supabase 的默认授权，线上真实的授权（比如有没有别的角色、列级授权）没有连上去看过。上线后可以用测试账号（hao-test）的 token 调一次 `PATCH /rest/v1/workspaces?id=eq.<自己的药柜>` 改 `name`，应该返回 403（`permission denied`）。
