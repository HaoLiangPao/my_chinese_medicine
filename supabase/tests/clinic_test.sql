-- MVP4：诊所、病人、处方挂病人
\ir _helpers.sql
:as_hao;
-- ---- 建诊所 ----
select ensure_default_workspace() as home \gset
select assert_raises($$select create_clinic('  ')$$, '请填写诊所名称', '空名字');
select create_clinic(' 李医生诊所 ') as clinic \gset
select assert_eq(ensure_default_workspace(), :'clinic'::uuid, '建完自动切到诊所');
select assert_eq((select kind || ':' || name from workspaces where id = :'clinic'), 'clinic:李医生诊所', '类型和名字（去空格）');
select assert_eq((select string_agg(kind || '/' || is_active::text, ',' order by kind) from my_workspaces()), 'clinic/true,household/false', 'my_workspaces 带 kind');

-- ---- 病人 ----
insert into patients (workspace_id, name, phone) values (:'clinic', '张三', '(416) 555-0101') returning id as p1 \gset
select assert_eq((select phone_digits from patients where id = :'p1'), '4165550101', '电话只留数字');
select assert_raises(format('insert into patients (workspace_id, name, phone) values (%L, %L, %L)', :'clinic', '张三的弟弟', '416-555-0101'),
  'patients_phone_unique', '同一个电话不能建两次（格式不同也算）');
-- 只有电话
insert into patients (workspace_id, phone) values (:'clinic', '647 555 0202') returning id as p2 \gset
-- 只有名字
insert into patients (workspace_id, name) values (:'clinic', '王五') returning id as p3 \gset
insert into patients (workspace_id, name) values (:'clinic', '王五');                                     -- 同名可以（没有电话）
select assert_raises(format('insert into patients (workspace_id, name, phone) values (%L, %L, %L)', :'clinic', '  ', ''), 'check', '名字和电话至少一个');
select assert_raises(format('insert into patients (workspace_id, name) values (%L, %L)', :'home', '家里人'), '只有诊所可以建病人档案', '家庭药柜不能建病人');

-- ---- 处方挂病人 ----
insert into prescriptions (workspace_id, title, dose_count, patient_id, source, instructions)
values (:'clinic', '张三 10-27', 7, :'p1', 'clinic', '水煎服') returning id as rx \gset
insert into prescription_items (prescription_id, herb_id, grams_per_dose, special_prep, note, sort_order) values
  (:'rx', match_herb('炙黄芪'), 18, null, null, 0),
  (:'rx', match_herb('薄荷'), 3, '后下', '最后 5 分钟放', 1);
select assert_eq((select note from prescription_items where prescription_id = :'rx' and special_prep = '后下'), '最后 5 分钟放', '药材备注');
select assert_raises(format('insert into prescription_items (prescription_id, herb_id, grams_per_dose, note) values (%L, %L, 3, %L)', :'rx', match_herb('甘草'), repeat('长', 201)),
  'check', '备注太长');
select assert_raises(format('delete from patients where id = %L', :'p1'), 'foreign key', '有处方的病人不能删');
delete from patients where id = :'p3';   -- 没处方的可以删

-- 不能把病人挂到别的 workspace 的处方上
insert into prescriptions (workspace_id, title) values (:'home', '家里的方') returning id as homerx \gset
select assert_raises(format('update prescriptions set patient_id = %L where id = %L', :'p1', :'homerx'), 'foreign key', '病人和处方必须在同一个 workspace');

-- 有病人的诊所不算空
reset role;
select assert_eq(workspace_is_empty(:'clinic'), false, '有病人就不是空的');

-- ---- RLS ----
:as_other;
select ensure_default_workspace() is not null as _ \gset
select assert_eq((select count(*) from patients), 0::bigint, '外人看不到病人');
select assert_raises(format('insert into patients (workspace_id, name) values (%L, %L)', :'clinic', 'x'), 'row-level security', '外人不能往诊所加病人');
select create_clinic('别家诊所') as other_clinic \gset
select assert_raises(format('insert into prescriptions (workspace_id, patient_id) values (%L, %L)', :'other_clinic', :'p1'), 'foreign key', '别的诊所不能挂我的病人');

-- 家人（Tina 被邀请进 Hao 的家庭药柜）看不到诊所
:as_hao;
select set_active_workspace(:'home');
select invite_member(:'home', 'tina@example.com');
:as_tina;
select accept_invitation((select id from my_invitations()));
select assert_eq((select count(*) from patients), 0::bigint, '家人看不到诊所的病人');
select assert_eq((select count(*) from prescriptions where source = 'clinic'), 0::bigint, '家人看不到诊所的处方');

\echo 'clinic_test: PASSED'
