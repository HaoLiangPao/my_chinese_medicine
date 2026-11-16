-- 本罐照片（LBL-8，docs/design/0010 §3.5）：pantry_settings.photo_path 和 storage 策略用的 can_access_jar_photo
\ir _helpers.sql

select h.id as maidong from herbs h where name_zh = '麦冬' \gset
select h.id as huangqi from herbs h where name_zh = '黄芪' \gset

:as_hao;
select ensure_default_workspace() as ws \gset
reset role;
:as_tina;
select ensure_default_workspace() as ws2 \gset
reset role;

select (:'ws' || '/' || :'maidong' || '/11111111-1111-1111-1111-111111111111.webp') as hao_path \gset
select (:'ws2' || '/' || :'maidong' || '/22222222-2222-2222-2222-222222222222.webp') as tina_path \gset

-- ---- 路径必须属于这一行的药柜和药材 ----
:as_hao;
insert into pantry_settings (workspace_id, herb_id, photo_path) values (:'ws', :'maidong', :'hao_path');
select assert_eq((select photo_path from pantry_settings where workspace_id = :'ws' and herb_id = :'maidong'), :'hao_path', '自己的路径能存');
select assert_raises(format('insert into pantry_settings (workspace_id, herb_id, photo_path) values (%L, %L, %L)', :'ws', :'huangqi', :'hao_path'),
  'ps_photo_path', '路径里的药材要和这一行一致');
select assert_raises(format('update pantry_settings set photo_path = %L where workspace_id = %L and herb_id = %L', :'tina_path', :'ws', :'maidong'),
  'ps_photo_path', '不能指向别的药柜的文件');
select assert_raises(format('update pantry_settings set photo_path = %L where workspace_id = %L and herb_id = %L', :'ws' || '/' || :'maidong' || '/../x.webp', :'ws', :'maidong'),
  'ps_photo_path', '路径格式不对');
select assert_raises(format('update pantry_settings set photo_path = %L where workspace_id = %L and herb_id = %L', :'ws' || '/' || :'maidong' || '/11111111-1111-1111-1111-111111111111.png', :'ws', :'maidong'),
  'ps_photo_path', '只能是 webp / jpg');
-- 旧代码的 upsert 不带 photo_path，不会把照片清掉
insert into pantry_settings (workspace_id, herb_id, jar_label, low_stock_grams) values (:'ws', :'maidong', 'A3', 50)
on conflict (workspace_id, herb_id) do update set jar_label = excluded.jar_label, low_stock_grams = excluded.low_stock_grams;
select assert_eq((select photo_path from pantry_settings where workspace_id = :'ws' and herb_id = :'maidong'), :'hao_path', '改罐号不影响照片');

-- ---- storage 策略：只放行自己药柜的文件 ----
select assert_eq(can_access_jar_photo(:'hao_path'), true, '自己药柜的文件能读写');
select assert_eq(can_access_jar_photo(:'tina_path'), false, '别的药柜的文件读不到');
select assert_eq(can_access_jar_photo('not-a-uuid/x/y.webp'), false, '格式不对不放行（不报错）');
select assert_eq(can_access_jar_photo(:'ws' || '/x.webp'), false, '少一层也不放行');
select assert_eq(can_access_jar_photo(:'ws' || '/' || :'maidong' || '/11111111-1111-1111-1111-111111111111.jpg'), true, 'jpg 也行（Safari）');
select assert_eq(can_access_jar_photo(:'ws' || '/' || :'maidong' || '/11111111-1111-1111-1111-111111111111.png'), false, '别的格式不放行');
select assert_eq(can_access_jar_photo(null), false, '空的不放行');
reset role;

-- ---- 别的药柜：看不到这一行，也不能改 ----
:as_tina;
select assert_eq(can_access_jar_photo(:'hao_path'), false, 'Tina 读不到 Hao 的文件');
select assert_eq(can_access_jar_photo(:'tina_path'), true, 'Tina 能读自己的');
select assert_eq((select count(*) from pantry_settings where workspace_id = :'ws'), 0::bigint, '看不到别人的 pantry_settings');
update pantry_settings set photo_path = null where workspace_id = :'ws';
reset role;
select assert_eq((select photo_path from pantry_settings where workspace_id = :'ws' and herb_id = :'maidong'), :'hao_path', '别人改不掉');

-- ---- 未登录：不能调 ----
select assert_eq(has_function_privilege('anon', 'public.can_access_jar_photo(text)', 'execute'), false, 'anon 不能调');

-- ---- 删照片：设成空 ----
:as_hao;
update pantry_settings set photo_path = null where workspace_id = :'ws' and herb_id = :'maidong';
select assert_eq((select photo_path from pantry_settings where workspace_id = :'ws' and herb_id = :'maidong'), null::text, '自己能删');
reset role;
