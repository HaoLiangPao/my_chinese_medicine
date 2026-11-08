# 0011 · 医生改成下拉选择（RX-6）

- 状态：已实现（第 1 次上线：读写新字段，同时继续写文字字段）
- 日期：2026-11-07
- 作者：Hao、Claude

## 1. 背景

家庭录方的「医生」现在是一个文字框，默认填「李医生」。问题：

- 每次都要改，同一位医生会写成「李医生」「李大夫」「李 医生」好几种，以后按医生统计不准
- 默认值写死成「李医生」，对别的家庭没有意义

改成：下拉选择这个药柜记过的医生，没有的话当场新增；下一张方子默认选上一次的医生。

只改**家庭录方**。诊所开方的 `prescriber` 是诊所名称（`clinic/actions.ts`），不动。

## 2. 数据模型

新表 `prescribers`（按药柜隔离，和 `patients` 一样）：

```sql
create table public.prescribers (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name         text not null check (name = btrim(name) and char_length(name) between 1 and 100),
  created_by   uuid references auth.users(id) default auth.uid(),
  created_at   timestamptz not null default now(),
  unique (id, workspace_id)
);
create unique index prescribers_name_unique on public.prescribers (workspace_id, name);
```

- `prescriptions` 加可以为空的 `prescriber_id`，外键 `(prescriber_id, workspace_id) → prescribers (id, workspace_id)`：医生必须和药方在同一个药柜。
- RLS：`is_member(workspace_id)`，别的药柜看不到、也不能挂。
- 同一个药柜里名字不能重复（去掉首尾空格以后）。

### 回填（迁移已有数据）

已有的家庭药方（`source <> 'clinic'`）：按药柜把 `prescriber` 文字去掉首尾空格、去重，建医生记录，再回填 `prescriber_id`。

- 空的、全是空格的不建
- 诊所处方不建（文字是诊所名称）
- 重复执行结果一样（`on conflict do nothing`，只回填 `prescriber_id` 为空的）
- 升级测试：`supabase/tests/upgrade/20261108000014_prescribers.sql`

## 3. 上线顺序（先扩展、后收缩，见 0009 §3）

| 上线 | 数据库 | 代码 | 旧代码还能用吗 |
|---|---|---|---|
| 第 1 次（本 PR） | 加表、加可以为空的列、回填 | 读写 `prescriber_id`，**同时继续写 `prescriber` 文字**（医生名字） | 能：旧代码只用文字字段 |
| 第 2 次（确认没问题以后） | 不动 | 不再写文字字段 | — |
| 以后（可以不做） | 删文字字段 | — | — |

migration 上线、新代码还没上线的这段时间，旧代码存的药方没有 `prescriber_id`，只有文字。新代码显示时优先用 `prescribers.name`，没有就用文字，所以照样能显示。

## 4. 页面

录方表单的「医生」：

- 下拉：这个药柜的医生（按名字排）+「不填」+「＋ 新增医生…」
- 默认选：这个药柜**最近一张**挂了医生的药方的医生；一张都没有就是「不填」
- 选「＋ 新增医生…」→ 出现输入框；保存药方时建医生记录（同名的直接用已有的）
- 不填医生也能保存（以前空着会存成「李医生」，现在存成空）

药方详情页：显示 `prescribers.name`，老药方没有 `prescriber_id` 的显示文字字段。

## 5. 测试

| 层 | 要测的 |
|---|---|
| SQL `prescribers_test` | 同名（去空格后）不能建两个；别的药柜看不到、不能往里加、不能挂到自己的药方上；家人能看到 |
| 升级测试 | 已有家庭药方按药柜去重建医生、回填；诊所处方、空的不建；旧代码不填 `prescriber_id` 照样能存 |
| E2E `prescribers.spec.ts`（`@RX-6`） | 新建「李医生」→ 下一张默认选上；详情页显示名字；别的药柜看不到；老药方只有文字照样显示 |
