-- 药材默认照片的元数据（docs/design/0010 §3.5）
\ir _helpers.sql
grant execute on function public.assert_eq(anyelement, anyelement, text), public.assert_raises(text, text, text) to anon;

select h.id as huangqi from herbs h where name_zh = '黄芪' \gset
select h.id as zhq from herbs h where name_zh = '炙黄芪' \gset

-- 测试用的一行（真实数据由生成的 migration 导入，这里不依赖它有多少行）
delete from herb_photos where herb_id in (:'huangqi', :'zhq');
insert into herb_photos (herb_id, file, kind, author, license, license_url, source_url, width, height, reviewed_by, reviewed_at)
values (:'huangqi', 'huang-qi.webp', '饮片', '某作者', 'CC BY-SA 4.0', 'https://creativecommons.org/licenses/by-sa/4.0',
        'https://commons.wikimedia.org/wiki/File:X.jpg', 800, 600, 'Hao', '2026-11-12');

-- ---- 谁能读：登录和未登录都能读（以后的公开介绍页用）----
:as_hao;
select assert_eq((select file from herb_photos where herb_id = :'huangqi'), 'huang-qi.webp', '登录用户能读');
reset role;
set role anon; set request.jwt.claim.sub = '';
select assert_eq((select author from herb_photos where herb_id = :'huangqi'), '某作者', '未登录也能读');
reset role;

-- ---- 谁都不能写 ----
:as_hao;
select assert_raises(format('update herb_photos set file = %L where herb_id = %L', 'x.webp', :'huangqi'), 'permission denied', '登录用户不能改');
select assert_raises(format('delete from herb_photos where herb_id = %L', :'huangqi'), 'permission denied', '登录用户不能删');
select assert_raises(format($q$insert into herb_photos (herb_id, file, kind, license, source_url, reviewed_by, reviewed_at)
  values (%L, 'a.webp', '饮片', 'CC0', 'https://commons.wikimedia.org/wiki/File:A.jpg', '我', '2026-11-12')$q$, :'zhq'),
  'permission denied', '登录用户不能加');
reset role;
set role anon; set request.jwt.claim.sub = '';
select assert_raises(format('delete from herb_photos where herb_id = %L', :'huangqi'), 'permission denied', '未登录不能删');
reset role;

-- ---- 约束：只能是核对过的、授权明确的、Commons 上的、文件名不能带路径 ----
create function pg_temp.try_insert(p_file text, p_kind text, p_license text, p_source text, p_by text) returns void language sql as $$
  insert into herb_photos (herb_id, file, kind, license, source_url, reviewed_by, reviewed_at)
  values ((select id from herbs where name_zh = '炙黄芪'), p_file, p_kind, p_license, p_source, p_by, '2026-11-12');
$$;
select assert_raises($$select pg_temp.try_insert('../x.webp', '饮片', 'CC0', 'https://commons.wikimedia.org/wiki/File:A.jpg', 'Hao')$$, 'hp_file', '文件名不能带路径');
select assert_raises($$select pg_temp.try_insert('zhi-huang-qi.jpg', '饮片', 'CC0', 'https://commons.wikimedia.org/wiki/File:A.jpg', 'Hao')$$, 'hp_file', '只能是 webp');
select assert_raises($$select pg_temp.try_insert('zhi-huang-qi.webp', '叶子', 'CC0', 'https://commons.wikimedia.org/wiki/File:A.jpg', 'Hao')$$, 'hp_kind', '类型只能是饮片 / 药材 / 植物');
select assert_raises($$select pg_temp.try_insert('zhi-huang-qi.webp', '饮片', 'CC BY-NC 4.0', 'https://commons.wikimedia.org/wiki/File:A.jpg', 'Hao')$$, 'hp_license', '不能用 NC 授权');
select assert_raises($$select pg_temp.try_insert('zhi-huang-qi.webp', '饮片', 'GFDL', 'https://commons.wikimedia.org/wiki/File:A.jpg', 'Hao')$$, 'hp_license', '不能用白名单以外的授权');
select assert_raises($$select pg_temp.try_insert('zhi-huang-qi.webp', '饮片', 'CC0', 'https://baike.baidu.com/a.jpg', 'Hao')$$, 'hp_source', '只能是 Wikimedia Commons');
select assert_raises($$select pg_temp.try_insert('zhi-huang-qi.webp', '饮片', 'CC0', 'https://commons.wikimedia.org/wiki/File:A.jpg', ' ')$$, 'hp_reviewer', '要有核对人');
select assert_raises($$insert into herb_photos (herb_id, file, kind, license, source_url, reviewed_by)
  values ((select id from herbs where name_zh = '炙黄芪'), 'zhi-huang-qi.webp', '饮片', 'CC0', 'https://commons.wikimedia.org/wiki/File:A.jpg', 'Hao')$$,
  'reviewed_at', '要有核对日期');
-- 合法的几种授权都能放
do $$
declare l text;
begin
  foreach l in array array['Public domain', 'CC0', 'CC BY 2.0', 'CC BY-SA 3.0', 'CC BY-SA 4.0'] loop
    delete from herb_photos where herb_id = (select id from herbs where name_zh = '炙黄芪');
    perform pg_temp.try_insert('zhi-huang-qi.webp', '植物', l, 'https://commons.wikimedia.org/wiki/File:A.jpg', 'Hao');
  end loop;
end $$;
select assert_eq((select license from herb_photos where herb_id = :'zhq'), 'CC BY-SA 4.0', '合法授权都能放');

-- ---- 删掉药材时照片元数据一起删 ----
select assert_eq((select count(*) from herb_photos where herb_id = :'zhq'), 1::bigint, '删之前有');
delete from herbs where id = :'zhq';
select assert_eq((select count(*) from herb_photos where herb_id = :'zhq'), 0::bigint, '药材删了，照片元数据也删');
