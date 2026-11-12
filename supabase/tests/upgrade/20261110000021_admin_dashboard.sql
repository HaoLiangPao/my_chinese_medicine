-- migration 20261110000021_admin_dashboard 在「有数据的库」上的行为（docs/design/0015）
-- 只加新表和新函数，已有数据一条不改（compare.sql 检查）；这里检查：上线后没有任何管理员，
-- 加上管理员以后拿到的数字和 fixture.sql 里造的数据一致，输出里没有病人信息，旧代码的读写照常
\ir ../_helpers.sql

select assert_eq((select count(*) from platform_admins), 0::bigint, '上线后没有任何管理员');

-- 医生（u3）不是管理员
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a3';
select assert_eq(is_platform_admin(), false, '医生不是管理员');
select assert_raises('select * from admin_overview()', '没有权限', '医生调不了统计');
select assert_eq((select count(*) from prescriptions), 2::bigint, '医生照常读自己诊所的 2 张处方');
reset role;

insert into platform_admins (user_id) values ('00000000-0000-0000-0000-0000000000a5');
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a5';
-- fixture 5 个账号 + _helpers.sql 的 3 个测试账号 = 8 个（都没选类型）；家庭药柜 5 个（u1–u5 各一个「我们家」）、诊所 2 个；病人 3 个；
-- 处方 u1 两张 + u2 在自己家一张、帮 u1 录一张 + u3 两张 + u4 两张 = 8 张，5 个账号里 4 个建过
select assert_eq(
  (select row(users_total, users_household + users_clinic + users_unset, workspaces_household, workspaces_clinic,
              patients_total, prescriptions_total, prescriptions_in_window, active_users_in_window)::text from admin_overview()),
  '(8,8,5,2,3,8,8,4)', '概况和 fixture 一致');
select assert_eq((select string_agg(prescriptions::text, ',' order by prescriptions desc) from admin_user_activity()), '2,2,2,2',
  '每个账号的处方数：u1、u3、u4 各 2 张；u2 自己家 1 张 + 帮 u1 录的 1 张（算录的人）');
-- 样本都很小：没有单独显示的药材和组合
select assert_eq((select count(*) from admin_top_herbs(null, 50) where herb_name is not null), 0::bigint, '没有药材过门槛');
select assert_eq((select count(*) from admin_top_pairs(null, 50) where herb_a is not null), 0::bigint, '没有组合过门槛');
select assert_eq(
  (select count(*) from (
     select row(x.*)::text t from admin_user_activity() x
     union all select row(x.*)::text from admin_top_herbs(null, 50) x
     union all select row(x.*)::text from admin_top_pairs(null, 50) x) a
   where t ~ '张三|王五|416|647|李医生|example\.com'),
  0::bigint, '输出里没有病人姓名、电话、诊所名、病人账号的邮箱');
-- 管理员自己（u5）直接查表：没有后门
select assert_eq((select count(*) from prescriptions), 0::bigint, '管理员直接查处方：自己没有，别人的看不到');
select assert_eq((select count(*) from patients), 0::bigint, '管理员直接查不到病人');
reset role;
