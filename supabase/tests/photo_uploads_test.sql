-- 照片登记和清理候选（docs/design/0012-photo-cleanup.md）
\ir _helpers.sql

:as_hao;
select ensure_default_workspace() as ws \gset
-- 三张：老的没用上（要清）、老的已挂到药方（留）、新的没用上（留，还没到 7 天）
insert into photo_uploads (path, workspace_id) values (:'ws' || '/old-unused.jpg', :'ws'), (:'ws' || '/old-used.jpg', :'ws'), (:'ws' || '/new.jpg', :'ws');
insert into prescriptions (workspace_id, title, photo_path) values (:'ws', '有照片的方', :'ws' || '/old-used.jpg');
select assert_raises(format('insert into photo_uploads (path, workspace_id) values (%L, %L)', 'other/x.jpg', :'ws'), 'photo_uploads_path_in_workspace', '路径第一段要是药柜 id');
select assert_raises(format('update photo_uploads set created_at = now() where path = %L', :'ws' || '/new.jpg'), 'permission denied', '登记不能改');
reset role;
update photo_uploads set created_at = now() - interval '8 days' where path like '%/old-%';

:as_hao;
select assert_eq((select array_agg(p order by p) from stale_photo_paths() p), array[:'ws' || '/old-unused.jpg'], '只有老的、没用上的');
select assert_eq((select count(*) from stale_photo_paths(30)), 0::bigint, '30 天的话一张都不到');
reset role;

-- 别的药柜看不到、删不掉
:as_tina;
select ensure_default_workspace() as ws2 \gset
select assert_eq((select count(*) from photo_uploads), 0::bigint, '看不到别人的照片登记');
select assert_eq((select count(*) from stale_photo_paths()), 0::bigint, '清理候选里没有别人的');
delete from photo_uploads;
select assert_raises(format('insert into photo_uploads (path, workspace_id) values (%L, %L)', :'ws' || '/sneak.jpg', :'ws'), 'row-level security', '不能往别人的药柜登记');
reset role;
select assert_eq((select count(*) from photo_uploads), 3::bigint, '别人删不掉');

-- 自己能删
:as_hao;
delete from photo_uploads where path = :'ws' || '/old-unused.jpg';
select assert_eq((select count(*) from photo_uploads), 2::bigint, '自己能删');
reset role;

select assert_eq(has_function_privilege('anon', 'public.stale_photo_paths(integer)', 'execute'), false, 'anon 不能调');
set role anon; set request.jwt.claim.sub = '';
select assert_raises($$select count(*) from photo_uploads$$, 'permission denied', 'anon 读不到');
reset role;
