-- RX-6：医生（prescribers）。设计见 docs/design/0011-prescribers.md
\ir _helpers.sql
:as_hao;
select ensure_default_workspace() as home \gset

-- ---- 建医生、挂到药方上 ----
insert into prescribers (workspace_id, name) values (:'home', '李医生') returning id as li \gset
select assert_raises(format('insert into prescribers (workspace_id, name) values (%L, %L)', :'home', '李医生'),
  'prescribers_name_unique', '同一个药柜里同名医生不能建两个');
select assert_raises(format('insert into prescribers (workspace_id, name) values (%L, %L)', :'home', ' 李医生 '),
  'check', '名字前后不能有空格（App 先去空格）');
select assert_raises(format('insert into prescribers (workspace_id, name) values (%L, %L)', :'home', ''), 'check', '名字不能为空');
select assert_eq((select created_by from prescribers where id = :'li'), '00000000-0000-0000-0000-00000000000a'::uuid, '记下谁建的');

insert into prescriptions (workspace_id, title, prescriber, prescriber_id) values (:'home', '补气方', '李医生', :'li') returning id as rx \gset
select assert_eq((select d.name from prescriptions p join prescribers d on d.id = p.prescriber_id where p.id = :'rx'), '李医生', '药方挂上医生');
select assert_raises(format('delete from prescribers where id = %L', :'li'), 'foreign key', '有药方的医生不能删');

-- 老药方：只有文字，没有 prescriber_id
insert into prescriptions (workspace_id, title, prescriber) values (:'home', '老方子', '王大夫') returning id as old \gset
select assert_eq((select prescriber_id from prescriptions where id = :'old'), null::uuid, '不填 prescriber_id 也能存（旧代码）');

-- ---- 隔离 ----
:as_other;
select ensure_default_workspace() as other_home \gset
select assert_eq((select count(*) from prescribers), 0::bigint, '别的药柜看不到医生');
select assert_raises(format('insert into prescribers (workspace_id, name) values (%L, %L)', :'home', '外人'), 'row-level security', '不能往别的药柜加医生');
insert into prescribers (workspace_id, name) values (:'other_home', '李医生');   -- 不同药柜可以同名
select assert_raises(format('insert into prescriptions (workspace_id, title, prescriber_id) values (%L, %L, %L)', :'other_home', 'x', :'li'),
  'foreign key', '不能把别的药柜的医生挂到自己的药方上');

-- 家人（被邀请进 Hao 的药柜）能看到、能用
:as_hao;
select invite_member(:'home', 'tina@example.com');
:as_tina;
select accept_invitation((select id from my_invitations()));
select assert_eq((select string_agg(name, ',') from prescribers), '李医生', '家人看得到这个药柜的医生');
insert into prescriptions (workspace_id, title, prescriber, prescriber_id) values (:'home', '家人录的方', '李医生', :'li');
reset role;
