-- migration 20261108000015_photo_uploads 在「有数据的库」上的行为（docs/design/0012）
-- 本地测试库没有 storage schema，补登记跳过；线上会从 storage.objects 补登记（那段只能在线上验证）
\ir ../_helpers.sql

select assert_eq((select count(*) from photo_uploads), 0::bigint, '本地没有 storage，没有补登记');
-- 旧代码照常：保存带照片的药方不需要登记
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';
insert into prescriptions (workspace_id, title, photo_path)
select active_workspace_id, '旧代码存的带照片药方', active_workspace_id || '/legacy.jpg' from user_settings where user_id = auth.uid();
select assert_eq((select count(*) from stale_photo_paths()), 0::bigint, '没有登记的照片不会被清理（旧照片只靠线上补登记）');
reset role;
