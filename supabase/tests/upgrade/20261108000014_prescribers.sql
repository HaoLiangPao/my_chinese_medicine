-- migration 20261108000014_prescribers 在「有数据的库」上的行为（docs/design/0011 §2）
-- 已有的家庭药方：按药柜去重建医生、回填 prescriber_id；诊所处方、空的不建；旧代码照样能存
\ir ../_helpers.sql

select assert_eq((select count(*) from prescriptions where source <> 'clinic' and nullif(btrim(prescriber), '') is not null and prescriber_id is null),
  0::bigint, '有医生文字的家庭药方都挂上了');
select assert_eq((select count(*) from prescriptions where source = 'clinic' and prescriber_id is not null), 0::bigint, '诊所处方不挂');
select assert_eq((select count(*) from prescriptions p join prescribers d on d.id = p.prescriber_id
  where d.name <> btrim(regexp_replace(p.prescriber, '[[:space:]　]+', ' ', 'g'))),
  0::bigint, '挂上的医生和原来的文字一致（整理空白后）');
select assert_eq((select count(*) from prescriptions p join prescribers d on d.id = p.prescriber_id where d.workspace_id <> p.workspace_id),
  0::bigint, '医生和药方在同一个药柜');

-- u1 的家里：补气方、还没煎的方、家人帮忙录的方都是「李医生」（后两张是默认值）→ 只建一个
select assert_eq(
  (select string_agg(d.name, ',') from prescribers d join workspace_members m on m.workspace_id = d.workspace_id and m.role = 'owner'
   where m.user_id = '00000000-0000-0000-0000-0000000000a1'),
  '李医生', 'u1 家里去重后只有一个李医生');
select assert_eq((select count(*) from prescribers d join workspaces w on w.id = d.workspace_id where w.kind = 'clinic'), 0::bigint, '诊所没有建医生记录');

-- 再执行一次结果一样
select count(*) as before from prescribers \gset
\ir ../../migrations/20261108000014_prescribers.sql
select assert_eq((select count(*) from prescribers), :'before'::bigint, '重复执行不会多建');

-- migration 上线后、新代码上线前，旧代码又存了各种手打的医生文字（以 postgres 身份插，模拟线上已有的行）；
-- 再执行一次 migration 要把它们按规则补挂上
select d.workspace_id as w1 from prescribers d join workspace_members m on m.workspace_id = d.workspace_id and m.role = 'owner'
  where m.user_id = '00000000-0000-0000-0000-0000000000a1' \gset
select id as clinic from workspaces where name = '李医生诊所' \gset
insert into prescriptions (workspace_id, title, prescriber) values
  (:'w1', 'e-前后空格', '  李医生 '),
  (:'w1', 'e-全角空格', '李医生　'),
  (:'w1', 'e-中间两个空格', '王  大夫'),
  (:'w1', 'e-中间一个空格', '王 大夫'),
  (:'w1', 'e-空字符串', ''),
  (:'w1', 'e-全是空格', '   '),
  (:'w1', 'e-NULL', null),
  (:'w1', 'e-另一位', '张医生');
insert into prescriptions (workspace_id, title, prescriber, source) values (:'clinic', 'e-诊所', '赵医生', 'clinic');
\ir ../../migrations/20261108000014_prescribers.sql
select assert_eq((select string_agg(name, ',' order by name) from prescribers where workspace_id = :'w1'), '张医生,李医生,王 大夫',
  'u1 家里：前后空格、全角空格并进李医生；王大夫两种写法合成一个；另建张医生；空的不建');
select assert_eq(
  (select string_agg(p.title || '=' || coalesce(d.name, '∅'), ',' order by p.title)
   from prescriptions p left join prescribers d on d.id = p.prescriber_id where p.title like 'e-%'),
  'e-NULL=∅,e-中间一个空格=王 大夫,e-中间两个空格=王 大夫,e-全是空格=∅,e-全角空格=李医生,e-前后空格=李医生,e-另一位=张医生,e-空字符串=∅,e-诊所=∅',
  '每张药方挂上的医生');
select assert_eq((select count(*) from prescribers where workspace_id = :'clinic'), 0::bigint, '诊所处方带医生文字也不建');

-- 旧代码照常存药方：只写文字，不写 prescriber_id
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';
insert into prescriptions (workspace_id, title, prescriber)
select workspace_id, '旧代码存的方', '张医生' from workspace_members where user_id = '00000000-0000-0000-0000-0000000000a1' and role = 'owner';
select assert_eq((select prescriber_id from prescriptions where title = '旧代码存的方'), null::uuid, '旧代码存的药方没有 prescriber_id，照样能存');
reset role;
