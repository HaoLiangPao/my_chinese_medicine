-- 平台管理员看板（docs/design/0015-admin-dashboard.md）
-- 非管理员拿不到任何数据；管理员拿到的数字和下面手算的一致；小样本门槛；客户端改不了 platform_admins；RLS 没有后门；
-- 医生、病人账号、Bug 反馈
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

-- 甘草每副 30 克（其他都是 10 克）；hao 2 月 20 日那张「黄芪 + 甘草」开 2 剂
update prescription_items set grams_per_dose = 30 where herb_id = (select id from herbs where name_zh = '甘草');
update prescriptions set dose_count = 2
 where created_by = :'H' and created_at = '2026-02-20 12:00'::timestamp at time zone 'America/Toronto'
   and id in (select prescription_id from prescription_items where herb_id = (select id from herbs where name_zh = '甘草'));
-- 诊所 2 月的配药：每张处方按处方量扣库存（以超级用户写流水，occurred_at 可以指定）；另外记 3 次煎药
insert into inventory_txns (workspace_id, herb_id, delta_grams, kind, prescription_id, occurred_at)
select p.workspace_id, i.herb_id, -(i.grams_per_dose * p.dose_count), 'consume', p.id, p.created_at
from prescriptions p join prescription_items i on i.prescription_id = p.id where p.workspace_id = :'wt';
insert into decoctions (workspace_id, doses, decocted_at) select :'wt', 1, '2026-02-12 12:00' from generate_series(1, 3);
-- Bug 反馈：hao（病人账号）和 tina（医生）各一条
insert into bug_reports (reporter_id, workspace_id, page_path, description) values
  (:'H', :'wh', '/prescriptions/new', '保存不了'), (:'T', :'wt', '/clinic/prescribe', '选不了病人');

-- ---- 不是管理员：每个函数都报错，一行都拿不到 ----
create temp table fns (sql text);
insert into fns values
  ('select * from admin_overview()'), ('select * from admin_overview(''2026-02-01'', ''2026-02-28'')'),
  ('select * from admin_prescription_trend(''day'')'), ('select * from admin_prescription_trend(''week'', ''2026-02-01'', ''2026-02-28'')'),
  ('select * from admin_prescription_trend(''day'', ''infinity'')'),
  ('select * from admin_user_activity()'), ('select * from admin_top_herbs()'), ('select * from admin_top_herbs(''2026-02-01'', null, 40, ''rx'')'),
  ('select * from admin_top_pairs()'), ('select * from admin_doctors()'),
  ('select * from admin_doctor_consumption(''00000000-0000-0000-0000-00000000000c'')'),
  ('select * from admin_patient_accounts()'), ('select * from admin_bug_reports()'),
  ($$select admin_set_bug_status((select id from bug_reports limit 1), 'fixed')$$);
grant select on fns to authenticated, anon;
grant select on bug_reports to anon;  -- 让「未登录」的那一步走到函数的执行权限检查（子查询要能读表）

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
select assert_eq((select count(*) from bug_reports where status <> 'new'), 0::bigint, '非管理员没改成状态');

set role anon; set request.jwt.claim.sub = '';
select assert_raises(sql, 'permission denied', '未登录调 ' || sql) from fns;
select assert_raises('select is_platform_admin()', 'permission denied', '未登录不能调 is_platform_admin');
reset role;
revoke select on bug_reports from anon;

-- ---- 客户端改不了、也读不了 platform_admins；内部函数不能直接调 ----
:as_hao;
select assert_raises($$insert into platform_admins (user_id) values ('00000000-0000-0000-0000-00000000000a')$$, 'permission denied', '不能把自己加成管理员');
select assert_raises($$select count(*) from platform_admins$$, 'permission denied', '读不了管理员名单');
select assert_raises($$update platform_admins set note = 'x'$$, 'permission denied', '不能改');
select assert_raises($$delete from platform_admins$$, 'permission denied', '不能删');
select assert_raises($$select admin_require()$$, 'permission denied', '内部函数 admin_require 不能直接调');
select assert_raises($$select * from admin_window('2026-02-01', null)$$, 'permission denied', '内部函数 admin_window 不能直接调');
select assert_raises($$select * from admin_herb_counts('2026-02-01', null)$$, 'permission denied', '内部函数 admin_herb_counts 不能直接调');
select assert_raises($$select * from admin_pair_counts('2026-02-01', null)$$, 'permission denied', '内部函数 admin_pair_counts 不能直接调');
select assert_raises($$select admin_min_subjects()$$, 'permission denied', '内部函数 admin_min_subjects 不能直接调');
select assert_raises($$select * from admin_user_numbers()$$, 'permission denied', '内部函数 admin_user_numbers 不能直接调');
select assert_raises($$select * from admin_account_workspaces('00000000-0000-0000-0000-00000000000c')$$, 'permission denied', '内部函数 admin_account_workspaces 不能直接调');
reset role;

-- ---- Hao 用 SQL 加成管理员（和线上一样）----
insert into platform_admins (user_id, note) select id, '测试' from auth.users where email = 'hao@example.com';

:as_hao;
select assert_eq(is_platform_admin(), true, '现在是管理员');
-- RLS 没有后门：直接查表只看到自己药柜的
select assert_eq((select count(*) from prescriptions), 2::bigint, '管理员直接查处方只看到自己的 2 张');
select assert_eq((select count(*) from patients), 0::bigint, '管理员直接查不到病人档案');
select assert_eq((select count(*) from prescription_items), 4::bigint, '管理员直接查只看到自己处方里的药');
select assert_eq((select count(*) from inventory_txns), 0::bigint, '管理员直接查不到诊所的库存流水');
select assert_eq((select count(*) from bug_reports), 1::bigint, '管理员直接查 bug_reports 只看到自己提交的');
select assert_raises($$select count(*) from platform_admins$$, 'permission denied', '管理员也读不了名单');

-- ---- 概况：4 个账号（家庭 2、诊所 1、没选 1）；药柜 家庭 2、诊所 1；病人 6；处方共 14，2 月 13 张，3 个账号 ----
select assert_eq(
  (select row(users_total, users_household, users_clinic, users_unset, workspaces_household, workspaces_clinic,
              patients_total, prescriptions_total, prescriptions_in_window, active_users_in_window)::text
   from admin_overview('2026-02-01', '2026-02-28')),
  '(4,2,1,1,2,1,6,14,13,3)', '概况 2026-02');
select assert_eq((select prescriptions_in_window from admin_overview()), 14, '不限时间 14 张');
select assert_eq((select prescriptions_in_window from admin_overview('2026-01-01', '2026-01-31')), 1, '1 月只有多伦多 1 月 31 日那张');
-- 任意起止日期，两头都包含：2 月 3 日到 10 日 = 3 日 2 张 + 5 日 1 张 + 10 日 2 张
select assert_eq((select prescriptions_in_window from admin_overview('2026-02-03', '2026-02-10')), 5, '起止日期都包含');
select assert_eq((select prescriptions_in_window from admin_overview('2026-02-04', '2026-02-09')), 1, '4 日到 9 日只有 5 日那张');
select assert_eq((select prescriptions_in_window from admin_overview('2026-02-20', null)), 6, '只给开始日期：20 日 2、24 日、25 日、26 日、28 日');

-- ---- 趋势 ----
select assert_eq((select count(*) from admin_prescription_trend('day', '2026-02-01', '2026-02-28')), 28::bigint, '2 月 28 天，每天一行');
select assert_eq(
  (select string_agg(extract(day from bucket_start) || ':' || prescriptions, ',' order by bucket_start)
   from admin_prescription_trend('day', '2026-02-01', '2026-02-28') where prescriptions > 0),
  '3:2,5:1,10:2,17:2,20:2,24:1,25:1,26:1,28:1', '2 月每天的处方数（2 月 28 日深夜那张按多伦多时间算）');
-- 每周（周一开始）：1/26 那周只数 2 月 1 日（1 月 31 日那张不在时间段里）
select assert_eq(
  (select string_agg(to_char(bucket_start, 'MM-DD') || ':' || prescriptions, ',' order by bucket_start)
   from admin_prescription_trend('week', '2026-02-01', '2026-02-28')),
  '01-26:0,02-02:3,02-09:2,02-16:4,02-23:4', '2 月每周的处方数');
select assert_eq((select sum(prescriptions) from admin_prescription_trend('week')), 14::bigint, '不限时间：从第一张处方到今天，全部都在');
select assert_raises($$select * from admin_prescription_trend('day', '2000-01-01', '2026-01-01')$$, '时间段太长', '按天最多 400 个点');

-- ---- 每个账号（2 月）：医生显示邮箱；病人账号只有编号；自己标出来 ----
select assert_eq(
  (select string_agg(coalesce(email, '-') || '/' || coalesce(account_kind, '-') || '/' || prescriptions || '/' || herbs || '/' || last_on || '/' || is_me,
                     ',' order by prescriptions desc, last_on)
   from admin_user_activity('2026-02-01', '2026-02-28')),
  'tina@example.com/clinic/9/7/2026-02-26/false,-/household/2/3/2026-02-20/true,-/household/2/2/2026-02-28/false',
  '每个账号的处方数、药材种数、最后一次');
select assert_eq((select count(distinct user_no) from admin_user_activity('2026-02-01', '2026-02-28')), 3::bigint, '每个账号有不同的编号');

-- ---- 常用药材（2 月）----
--   黄芪 9 张、6 位病人（诊所 5 位 / 家庭 1 个 → 取 5）→ 显示；累计 8 张 × 10 g + hao 那张 10 g × 2 剂 = 100 g
--   甘草 6 张、诊所 5 位 → 显示；累计 5 × 30 g + 30 g × 2 剂 = 210 g
--   白术 6 张但只有 2 位诊所病人（P1 开了 4 次）+ 1 个家庭 → 不显示；当归、茯苓、党参、川芎也不到 → 「其他 5 味」
select assert_eq(
  (select string_agg(coalesce(herb_name, '其他') || ':' || coalesce(prescriptions::text, '-') || ':' || coalesce(total_grams::numeric(10,0)::text, '-') || ':' || coalesce(other_herbs::text, '-'), ',')
   from admin_top_herbs('2026-02-01', '2026-02-28')),
  '甘草:6:210:-,黄芪:9:100:-,其他:-:-:5', '按累计克数排；小样本合并');
select assert_eq(
  (select string_agg(coalesce(herb_name, '其他'), ',') from admin_top_herbs('2026-02-01', '2026-02-28', 10, 'rx')),
  '黄芪,甘草,其他', '按处方张数排');
select assert_eq((select count(*) from admin_top_herbs('2026-02-01', '2026-02-28', 1) where herb_name is not null), 1::bigint, 'p_limit 起作用');
select assert_raises($$select * from admin_top_herbs(null, null, 10, 'name')$$, 'grams 或 rx', '排序只有两种');
-- 任意时间段也有门槛：2 月 3 日到 10 日，黄芪、甘草各 5 位诊所病人 → 显示；只看 3 日 → 2 位，不显示
select assert_eq((select string_agg(coalesce(herb_name, '其他'), ',' order by herb_name) from admin_top_herbs('2026-02-03', '2026-02-10')),
  '甘草,黄芪,其他', '一周里过了门槛的照样显示');
select assert_eq((select count(*) from admin_top_herbs('2026-02-03', '2026-02-03') where herb_name is not null), 0::bigint,
  '只选一天：每味药都不到 5 位病人，一味都不显示');
-- 常见组合：黄芪+甘草 6 张、诊所 5 位 → 显示；黄芪+白术 5 张但不到 5 位 → 不显示；一共 11 对，其他 10 对
select assert_eq(
  (select string_agg(coalesce(least(herb_a, herb_b) || '+' || greatest(herb_a, herb_b), '其他') || ':' || coalesce(prescriptions::text, '-') || ':' || coalesce(other_pairs::text, '-'), ',')
   from admin_top_pairs('2026-02-01', '2026-02-28')),
  (select least('甘草', '黄芪') || '+' || greatest('甘草', '黄芪')) || ':6:-,其他:-:10', '常见组合和小样本合并');

-- ---- 医生 ----
-- tina：病人档案 6（都是今天建的，2 月新建 0）；2 月看过 6 位、处方 9 张、煎药 3 次；
-- 库存消耗 = 诊所 9 张处方的处方量：P1-P5 第一张各 10+30+10 = 50 × 5，P1 两张黄芪白术 20 × 2，P6 20，P1 白术 10 = 320 g
select assert_eq(
  (select row(email, patients_total, patients_new, patients_seen, prescriptions, prescriptions_total, decoctions, consumed_grams::numeric(10,0), last_on)::text
   from admin_doctors('2026-02-01', '2026-02-28')),
  '(tina@example.com,6,0,6,9,9,3,320,2026-02-26)', '医生列表');
select assert_eq((select patients_new from admin_doctors(null, null, :'T')), 6, '不限时间：6 个病人都算新建');
select assert_eq((select count(*) from admin_doctors(null, null, :'H')), 0::bigint, '病人账号不在医生列表里');
-- 逐味消耗：甘草 5 位诊所病人 150 g、黄芪 5 位 70 g 显示；白术（2 位）、当归、茯苓、党参、川芎合并
select assert_eq(
  (select string_agg(coalesce(herb_name, '其他') || ':' || coalesce(consumed_grams::numeric(10,0)::text, other_herbs::text), ',')
   from admin_doctor_consumption(:'T', '2026-02-01', '2026-02-28')),
  '甘草:150,黄芪:70,其他:5', '医生的库存消耗，按克数排，小样本合并');
select assert_eq((select count(*) from admin_doctor_consumption(:'H')), 0::bigint, '病人账号没有诊所库存消耗');

-- ---- 病人账号：只有数字 ----
-- hao：家里 1 个人；2 月 2 张、用过 3 种药、1 天；stranger：2 月 2 张（不算 1 月 31 日那张）、2 种药、2 天，一共 3 张
select assert_eq(
  (select string_agg(members || '/' || prescriptions || '/' || prescriptions_total || '/' || herbs || '/' || decoctions || '/' || active_days || '/' || last_on || '/' || is_me,
                     ',' order by user_no)
   from admin_patient_accounts('2026-02-01', '2026-02-28')),
  '1/2/2/3/0/1/2026-02-20/true,1/2/3/2/0/2/2026-02-28/false', '病人账号列表');
select assert_eq((select count(*) from admin_patient_accounts(null, null, :'T')), 0::bigint, '医生不在病人账号列表里');
select assert_eq((select prescriptions from admin_patient_accounts(null, null, :'S')), 3, '详情页：只要一个账号');

-- ---- Bug 反馈 ----
select assert_eq(
  (select string_agg(page_path || '/' || status || '/' || coalesce(reporter_kind, '-') || '/' || coalesce(reporter_email, '-'), ',' order by page_path)
   from admin_bug_reports()),
  '/clinic/prescribe/new/clinic/tina@example.com,/prescriptions/new/new/household/-', 'Bug 列表：医生显示邮箱，病人账号没有');
select admin_set_bug_status((select id from admin_bug_reports() where page_path = '/clinic/prescribe'), 'in_progress');
select assert_eq((select string_agg(page_path, ',') from admin_bug_reports('in_progress')), '/clinic/prescribe', '改状态、按状态筛选');
select assert_raises($$select admin_set_bug_status((select id from admin_bug_reports() limit 1), 'done')$$, '状态不对', '状态只有四种');
select assert_raises($$select admin_set_bug_status(gen_random_uuid(), 'fixed')$$, '找不到', '没有这条反馈');
select assert_raises($$select * from admin_bug_reports('done')$$, '状态不对', '筛选的状态也要检查');

-- ---- 函数的输出里没有病人姓名、电话、备注、标题、医嘱、药柜名（Bug 列表的描述是用户自己写的，单独看待）----
select assert_eq(
  (select count(*) from (
     select row(o.*)::text t from admin_overview() o
     union all select row(x.*)::text from admin_user_activity() x
     union all select row(x.*)::text from admin_top_herbs(null, null, 50) x
     union all select row(x.*)::text from admin_top_pairs(null, null, 50) x
     union all select row(x.*)::text from admin_prescription_trend('week') x
     union all select row(x.*)::text from admin_doctors() x
     union all select row(x.*)::text from admin_doctor_consumption(:'T', null, null, 50) x
     union all select row(x.*)::text from admin_patient_accounts() x) a
   where t like '%秘密%' or t like '%416%' or t like '%测试诊所%' or t like '%我们家%' or t like '%hao@%' or t like '%stranger@%'),
  0::bigint, '输出里没有病人、药柜的信息和病人账号的邮箱');

-- ---- 日期 ----
select assert_raises($$select * from admin_overview('2026-02-10', '2026-02-01')$$, '不能晚于', '开始晚于结束');
select assert_raises($$select * from admin_overview('1980-01-01', null)$$, '超出范围', '太早');
select assert_raises($$select * from admin_top_herbs(null, 'infinity')$$, '超出范围', '不接受 infinity');
select assert_raises($$select * from admin_prescription_trend('day', '-infinity')$$, '超出范围', '不接受 -infinity');
select assert_raises($$select * from admin_prescription_trend('hour')$$, 'day、week、month 或 auto', '没有按小时');
-- auto：62 天以内按天，两年以内按周，再长按月
select assert_eq((select string_agg(distinct bucket, ',') || ':' || count(*) from admin_prescription_trend('auto', '2026-02-01', '2026-02-28')), 'day:28', 'auto：一个月按天');
select assert_eq((select string_agg(distinct bucket, ',') || ':' || count(*) from admin_prescription_trend('auto', '2026-01-01', '2026-06-30')), 'week:27', 'auto：半年按周');
select assert_eq((select string_agg(distinct bucket, ',') || ':' || count(*) from admin_prescription_trend('auto', '2020-01-01', '2026-06-30')), 'month:78', 'auto：几年按月');
reset role;

-- ---- 门槛正好 5 位病人：显示；4 位：合并（2026-03）----
select pg_temp.rx(:'wt', :'T', g, '2026-03-02 12:00', '茯苓', '当归') from generate_series(1, 4) g;
select pg_temp.rx(:'wt', :'T', 5, '2026-03-02 12:00', '茯苓');
-- ---- 家庭药柜整个算一位病人：hao 家 6 张黄芪也不显示（2026-04）----
select pg_temp.rx(:'wh', :'H', null, '2026-04-02 12:00', '黄芪') from generate_series(1, 6);
-- ---- 诊所里没挂病人的处方按药柜算一位（2026-05）----
select pg_temp.rx(:'wt', :'T', null, '2026-05-02 12:00', '黄芪') from generate_series(1, 6);
-- ---- 诊所病人和家庭不相加（同一个人可能两边都有）：3 位病人 + 3 个家庭 = 只算 3（2026-06）----
insert into auth.users values ('00000000-0000-0000-0000-0000000000e1', 'h1@example.com'), ('00000000-0000-0000-0000-0000000000e2', 'h2@example.com');
insert into workspaces (id, name, kind) values ('00000000-0000-0000-0000-0000000000f1', '家1', 'household'), ('00000000-0000-0000-0000-0000000000f2', '家2', 'household');
select pg_temp.rx(:'wt', :'T', g, '2026-06-02 12:00', '麦冬') from generate_series(1, 3) g;
select pg_temp.rx(w::uuid, :'H', null, '2026-06-03 12:00', '麦冬')
  from unnest(array[:'wh', '00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000f2']) w;
:as_hao;
select assert_eq((select string_agg(coalesce(herb_name, '其他') || ':' || coalesce(prescriptions, other_herbs), ',') from admin_top_herbs('2026-03-01', '2026-03-31')),
  '茯苓:5,其他:1', '正好 5 位显示，4 位合并');
select assert_eq((select string_agg(coalesce(herb_a, '其他') || ':' || other_pairs, ',') from admin_top_pairs('2026-03-01', '2026-03-31')),
  '其他:1', '4 位病人的组合不显示');
select assert_eq((select string_agg(coalesce(herb_name, '其他') || ':' || coalesce(prescriptions, other_herbs), ',') from admin_top_herbs('2026-04-01', '2026-04-30')),
  '其他:1', '一个家庭开 6 次也只算 1 位');
select assert_eq((select string_agg(coalesce(herb_name, '其他') || ':' || coalesce(prescriptions, other_herbs), ',') from admin_top_herbs('2026-05-01', '2026-05-31')),
  '其他:1', '诊所没挂病人的处方按药柜算 1 位');
select assert_eq((select count(*) from admin_top_pairs('2026-04-01', '2026-04-30')), 0::bigint, '没有组合时一行都没有');
select assert_eq((select string_agg(coalesce(herb_name, '其他') || ':' || coalesce(prescriptions, other_herbs), ',') from admin_top_herbs('2026-06-01', '2026-06-30')),
  '其他:1', '3 位诊所病人 + 3 个家庭不相加，不到 5 位');
-- 按月粒度：1 月 1 张、2 月 13、3 月 5、4 月 6、5 月 6、6 月 6；只数 tina 的诊所：0、9、5、0、6、3
select assert_eq((select string_agg(prescriptions::text, ',' order by bucket_start) from admin_prescription_trend('month', '2026-01-01', '2026-06-30')),
  '1,13,5,6,6,6', '按月的趋势');
select assert_eq((select string_agg(prescriptions::text, ',' order by bucket_start) from admin_prescription_trend('month', '2026-01-01', '2026-06-30', :'T')),
  '0,9,5,0,6,3', '一个医生的趋势只数他的诊所');
reset role;

-- ---- 去掉管理员身份：马上拿不到 ----
delete from platform_admins;
:as_hao;
select assert_eq(is_platform_admin(), false, '去掉以后不是管理员');
select assert_raises($$select * from admin_overview()$$, '没有权限', '去掉以后调不了');
reset role;
