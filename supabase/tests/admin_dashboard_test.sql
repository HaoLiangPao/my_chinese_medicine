-- 平台管理员数据看板（docs/design/0015-admin-dashboard.md）
-- 非管理员拿不到任何数据；管理员拿到的数字和下面手算的一致；小样本门槛；客户端改不了 platform_admins；RLS 没有后门
\ir _helpers.sql
grant execute on function public.assert_eq(anyelement, anyelement, text), public.assert_raises(text, text, text) to anon;

-- 和 Supabase 一样，auth.users.email 是 varchar（测试用的替身是 text；返回类型不一致时函数会报错）
alter table auth.users alter column email type varchar(255);

-- 第 4 个用户：只注册过、没选账号类型
insert into auth.users values ('00000000-0000-0000-0000-00000000000d', 'unset@example.com');

-- hao：病人账号（之后加成管理员）；stranger：病人账号；tina：医生账号
:as_hao;
select choose_account_kind('household') as wh \gset
:as_other;
select choose_account_kind('household') as ws \gset
:as_tina;
select choose_account_kind('clinic', '测试诊所') as wt \gset
reset role;

-- 诊所的 6 个病人。名字、电话、备注、处方标题、医嘱都是「不应出现」的内容，最后检查函数的输出里没有
insert into patients (workspace_id, name, phone, notes, created_by)
select :'wt', '秘密病人' || g, '416-555-010' || g, '秘密备注', '00000000-0000-0000-0000-00000000000c' from generate_series(1, 6) g;
create temp table pt as select row_number() over (order by name) as n, id from patients;

-- rx(药柜, 创建人, 病人编号或 null, 多伦多时间, 药材...)：以超级用户插入，created_at 可以指定
create function pg_temp.rx(ws uuid, who uuid, pn int, at timestamp, variadic herbs text[]) returns void language plpgsql as $$
declare p uuid;
begin
  insert into prescriptions (workspace_id, created_by, patient_id, created_at, title, instructions, notes, patient_label, source)
  values (ws, who, (select id from pt where n = pn), at at time zone 'America/Toronto', '秘密标题', '秘密医嘱', '秘密处方备注', '秘密家人',
          case when pn is null then 'manual' else 'clinic' end)
  returning id into p;
  insert into prescription_items (prescription_id, herb_id, grams_per_dose, note)
  select p, h.id, 10, '秘密药材备注' from unnest(herbs) x join herbs h on h.name_zh = x;
end $$;

\set T '00000000-0000-0000-0000-00000000000c'
\set H '00000000-0000-0000-0000-00000000000a'
\set S '00000000-0000-0000-0000-00000000000b'
-- 2026 年 2 月（2 月 1 日是星期日）
select pg_temp.rx(:'wt', :'T', 1, '2026-02-03 12:00', '黄芪', '甘草', '白术');
select pg_temp.rx(:'wt', :'T', 2, '2026-02-03 12:00', '黄芪', '甘草', '当归');
select pg_temp.rx(:'wt', :'T', 3, '2026-02-05 12:00', '黄芪', '甘草', '茯苓');
select pg_temp.rx(:'wt', :'T', 4, '2026-02-10 12:00', '黄芪', '甘草', '白术');
select pg_temp.rx(:'wt', :'T', 5, '2026-02-10 12:00', '黄芪', '甘草', '党参');
select pg_temp.rx(:'wt', :'T', 1, '2026-02-17 12:00', '黄芪', '白术');
select pg_temp.rx(:'wt', :'T', 6, '2026-02-17 12:00', '川芎', '当归');
select pg_temp.rx(:'wt', :'T', 1, '2026-02-24 12:00', '黄芪', '白术');
select pg_temp.rx(:'wt', :'T', 1, '2026-02-26 12:00', '白术');
select pg_temp.rx(:'wh', :'H', null, '2026-02-20 12:00', '黄芪', '甘草');
select pg_temp.rx(:'wh', :'H', null, '2026-02-20 12:00', '黄芪', '白术');
select pg_temp.rx(:'ws', :'S', null, '2026-02-25 12:00', '当归', '茯苓');
-- 边界：多伦多 2 月 28 日 23:30 = UTC 3 月 1 日，算 2 月；多伦多 1 月 31 日 23:30 = UTC 2 月 1 日，不算 2 月
select pg_temp.rx(:'ws', :'S', null, '2026-02-28 23:30', '当归');
select pg_temp.rx(:'ws', :'S', null, '2026-01-31 23:30', '黄芪');

-- ---- 不是管理员：每个函数都报错，一行都拿不到 ----
create temp table fns (sql text);
insert into fns values
  ('select * from admin_overview()'), ('select * from admin_overview(''2026-02-01'')'),
  ('select * from admin_prescription_trend(''day'')'), ('select * from admin_prescription_trend(''week'', ''2026-02-01'')'),
  ('select * from admin_user_activity()'), ('select * from admin_user_activity(''2026-02-01'')'),
  ('select * from admin_top_herbs()'), ('select * from admin_top_herbs(''2026-02-01'', 50)'),
  ('select * from admin_top_pairs()'), ('select * from admin_top_pairs(''2026-02-01'', 50)');
grant select on fns to authenticated, anon;

do $$ declare f text; begin
  foreach f in array array['00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000b',
                           '00000000-0000-0000-0000-00000000000c', '00000000-0000-0000-0000-00000000000d'] loop
    perform set_config('request.jwt.claim.sub', f, true);
    set local role authenticated;
    perform assert_eq(is_platform_admin(), false, '还不是管理员');
    perform assert_raises(s.sql, '没有权限', '非管理员调 ' || s.sql) from fns s;
    reset role;
  end loop;
end $$;

set role anon; set request.jwt.claim.sub = '';
select assert_raises(sql, 'permission denied', '未登录调 ' || sql) from fns;
select assert_raises('select is_platform_admin()', 'permission denied', '未登录不能调 is_platform_admin');
reset role;

-- ---- 客户端改不了、也读不了 platform_admins；内部函数不能直接调 ----
:as_hao;
select assert_raises($$insert into platform_admins (user_id) values ('00000000-0000-0000-0000-00000000000a')$$, 'permission denied', '不能把自己加成管理员');
select assert_raises($$select count(*) from platform_admins$$, 'permission denied', '读不了管理员名单');
select assert_raises($$update platform_admins set note = 'x'$$, 'permission denied', '不能改');
select assert_raises($$delete from platform_admins$$, 'permission denied', '不能删');
select assert_raises($$select admin_require()$$, 'permission denied', '内部函数 admin_require 不能直接调');
select assert_raises($$select * from admin_window('2026-02-01')$$, 'permission denied', '内部函数 admin_window 不能直接调');
select assert_raises($$select * from admin_herb_counts('2026-02-01')$$, 'permission denied', '内部函数 admin_herb_counts 不能直接调');
select assert_raises($$select * from admin_pair_counts('2026-02-01')$$, 'permission denied', '内部函数 admin_pair_counts 不能直接调');
select assert_raises($$select admin_min_subjects()$$, 'permission denied', '内部函数 admin_min_subjects 不能直接调');
reset role;

-- ---- Hao 用 SQL 加成管理员（和线上一样）----
insert into platform_admins (user_id, note) select id, '测试' from auth.users where email = 'hao@example.com';

:as_hao;
select assert_eq(is_platform_admin(), true, '现在是管理员');
-- RLS 没有后门：直接查表只看到自己药柜的
select assert_eq((select count(*) from prescriptions), 2::bigint, '管理员直接查处方只看到自己的 2 张');
select assert_eq((select count(*) from patients), 0::bigint, '管理员直接查不到病人档案');
select assert_eq((select count(*) from prescription_items), 4::bigint, '管理员直接查只看到自己处方里的药');
select assert_raises($$select count(*) from platform_admins$$, 'permission denied', '管理员也读不了名单');

-- 概况（2026-02）：4 个账号（家庭 2、诊所 1、没选 1）；药柜 家庭 2、诊所 1；病人 6；处方共 14，2 月 13 张，3 个账号
select assert_eq(
  (select row(users_total, users_household, users_clinic, users_unset, workspaces_household, workspaces_clinic,
              patients_total, prescriptions_total, prescriptions_in_window, active_users_in_window)::text
   from admin_overview('2026-02-01')),
  '(4,2,1,1,2,1,6,14,13,3)', '概况 2026-02');
select assert_eq((select prescriptions_in_window from admin_overview()), 14, '全部时间 14 张');
select assert_eq((select prescriptions_in_window from admin_overview('2026-01-01')), 1, '1 月只有多伦多 1 月 31 日那张');

-- 趋势：2 月每天（28 行），有处方的日子
select assert_eq((select count(*) from admin_prescription_trend('day', '2026-02-01')), 28::bigint, '2 月 28 天，每天一行');
select assert_eq(
  (select string_agg(extract(day from bucket_start) || ':' || prescriptions, ',' order by bucket_start)
   from admin_prescription_trend('day', '2026-02-01') where prescriptions > 0),
  '3:2,5:1,10:2,17:2,20:2,24:1,25:1,26:1,28:1', '2 月每天的处方数（2 月 28 日深夜那张按多伦多时间算）');
-- 每周（周一开始）：1/26 那周只数 2 月 1 日（1 月 31 日那张不在这个月）
select assert_eq(
  (select string_agg(to_char(bucket_start, 'MM-DD') || ':' || prescriptions, ',' order by bucket_start)
   from admin_prescription_trend('week', '2026-02-01')),
  '01-26:0,02-02:3,02-09:2,02-16:4,02-23:4', '2 月每周的处方数');
select assert_eq((select count(*) from admin_prescription_trend('day')), 30::bigint, '没给月份：最近 30 天');
select assert_eq((select count(*) from admin_prescription_trend('week')), 12::bigint, '没给月份：最近 12 周');

-- 每个账号（2026-02）：医生显示邮箱；病人账号只有编号；自己标出来
select assert_eq(
  (select string_agg(coalesce(email, '-') || '/' || coalesce(account_kind, '-') || '/' || prescriptions || '/' || herbs || '/' || last_on || '/' || is_me,
                     ',' order by prescriptions desc, last_on)
   from admin_user_activity('2026-02-01')),
  'tina@example.com/clinic/9/7/2026-02-26/false,-/household/2/3/2026-02-20/true,-/household/2/2/2026-02-28/false',
  '每个账号的处方数、药材种数、最后一次');
select assert_eq((select count(distinct user_no) from admin_user_activity('2026-02-01')), 3::bigint, '每个账号有不同的编号');
select assert_eq((select count(*) from admin_user_activity('2026-02-01') where email like '%hao%' or email like '%stranger%'), 0::bigint,
  '病人账号的邮箱不出现');

-- 常用药材（2026-02）：
--   黄芪 9 张、6 位病人（P1–P5 + hao 家）→ 显示；甘草 6 张、6 位 → 显示
--   白术 6 张但只有 3 位（P1 开了 4 次）→ 不显示；当归 3 位、茯苓 2、党参 1、川芎 1 → 不显示 → 「其他 5 味」
select assert_eq(
  (select string_agg(coalesce(herb_name, '其他') || ':' || coalesce(prescriptions::text, '-') || ':' || coalesce(other_herbs::text, '-'), ',')
   from admin_top_herbs('2026-02-01')),
  '黄芪:9:-,甘草:6:-,其他:-:5', '常用药材和小样本合并');
select assert_eq((select count(*) from admin_top_herbs('2026-02-01', 1) where herb_name is not null), 1::bigint, 'p_limit 起作用');
-- 常见组合：黄芪+甘草 6 张 6 位 → 显示；黄芪+白术 5 张但只有 3 位 → 不显示；一共 11 对，其他 10 对
select assert_eq(
  (select string_agg(coalesce(least(herb_a, herb_b) || '+' || greatest(herb_a, herb_b), '其他') || ':' || coalesce(prescriptions::text, '-') || ':' || coalesce(other_pairs::text, '-'), ',')
   from admin_top_pairs('2026-02-01')),
  (select least('甘草', '黄芪') || '+' || greatest('甘草', '黄芪')) || ':6:-,其他:-:10', '常见组合和小样本合并');

-- 函数的输出里没有病人姓名、电话、备注、标题、医嘱、药柜名
select assert_eq(
  (select count(*) from (
     select row(o.*)::text t from admin_overview() o
     union all select row(x.*)::text from admin_user_activity() x
     union all select row(x.*)::text from admin_top_herbs(null, 50) x
     union all select row(x.*)::text from admin_top_pairs(null, 50) x
     union all select row(x.*)::text from admin_prescription_trend('week') x) a
   where t like '%秘密%' or t like '%416%' or t like '%测试诊所%' or t like '%我们家%'),
  0::bigint, '输出里没有病人和药柜的信息');

-- 月份只能是 1 号；bucket 只有两种
select assert_raises($$select * from admin_top_herbs('2026-02-15')$$, '1 号', '不接受任意日期');
select assert_raises($$select * from admin_overview('2026-02-02')$$, '1 号', '概况也只接受整月');
select assert_raises($$select * from admin_prescription_trend('hour')$$, 'day 或 week', '没有按小时');
reset role;

-- ---- 门槛正好 5 位病人：显示；4 位：合并（2026-03）----
select pg_temp.rx(:'wt', :'T', g, '2026-03-02 12:00', '茯苓', '当归') from generate_series(1, 4) g;
select pg_temp.rx(:'wt', :'T', 5, '2026-03-02 12:00', '茯苓');
-- ---- 家庭药柜整个算一位病人：hao 家 6 张黄芪也不显示（2026-04）----
select pg_temp.rx(:'wh', :'H', null, '2026-04-02 12:00', '黄芪') from generate_series(1, 6);
-- ---- 诊所里没挂病人的处方按药柜算一位（2026-05）----
select pg_temp.rx(:'wt', :'T', null, '2026-05-02 12:00', '黄芪') from generate_series(1, 6);
:as_hao;
select assert_eq((select string_agg(coalesce(herb_name, '其他') || ':' || coalesce(prescriptions, other_herbs), ',') from admin_top_herbs('2026-03-01')),
  '茯苓:5,其他:1', '正好 5 位显示，4 位合并');
select assert_eq((select string_agg(coalesce(herb_a, '其他') || ':' || other_pairs, ',') from admin_top_pairs('2026-03-01')),
  '其他:1', '4 位病人的组合不显示');
select assert_eq((select string_agg(coalesce(herb_name, '其他') || ':' || coalesce(prescriptions, other_herbs), ',') from admin_top_herbs('2026-04-01')),
  '其他:1', '一个家庭开 6 次也只算 1 位');
select assert_eq((select string_agg(coalesce(herb_name, '其他') || ':' || coalesce(prescriptions, other_herbs), ',') from admin_top_herbs('2026-05-01')),
  '其他:1', '诊所没挂病人的处方按药柜算 1 位');
select assert_eq((select count(*) from admin_top_pairs('2026-04-01')), 0::bigint, '没有组合时一行都没有');
reset role;

-- ---- 去掉管理员身份：马上拿不到 ----
delete from platform_admins;
:as_hao;
select assert_eq(is_platform_admin(), false, '去掉以后不是管理员');
select assert_raises($$select * from admin_overview()$$, '没有权限', '去掉以后调不了');
reset role;
