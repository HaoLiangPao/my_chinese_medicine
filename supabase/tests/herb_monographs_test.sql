-- 药材资料、审核人、修改记录（docs/design/0010 §3.1、§3.2）
\ir _helpers.sql
grant execute on function public.assert_eq(anyelement, anyelement, text), public.assert_raises(text, text, text) to anon;

select h.id as maidong from herbs h where name_zh = '麦冬' \gset
select h.id as zgc from herbs h where name_zh = '炙甘草' \gset

-- ---- 导入：每味药都有资料，全是草稿 ----
-- 2026-11-13 扩目录（docs/design/0017）：新加的 388 味这一版只有名字，资料分批补；原来的 119 味都有资料
select assert_eq((select count(*) from herb_monographs), 119::bigint, '资料草稿 119 味');
select assert_eq((select count(*) from herbs h join herb_monographs m on m.herb_id = h.id where h.name_zh in ('麦冬', '炙甘草', '南沙参', '铁皮石斛')), 4::bigint, '原来的药有资料');
select assert_eq((select count(*) from herbs h where h.name_zh in ('延胡索', '蜜麻黄') and not exists (select 1 from herb_monographs m where m.herb_id = h.id)), 2::bigint, '新加的药还没有资料');
select assert_eq((select count(*) from herb_monographs where status <> 'draft'), 0::bigint, '导入的全是草稿');
select assert_eq((select nature || ':' || array_to_string(flavors, ',') || ':' || array_to_string(meridians, ',') from herb_monographs where herb_id = :'maidong'),
  '微寒:甘,微苦:心,肺,胃', '麦冬的性味归经');
select assert_eq((select toxicity from herb_monographs m join herbs h on h.id = m.herb_id where h.name_zh = '半夏'), 'toxic', '半夏有毒');
select assert_eq((select check_note is not null from herb_monographs m join herbs h on h.id = m.herb_id where h.name_zh = '桃仁'), true, '要核对的地方导进来了');

-- ---- 谁能读 ----
:as_hao;
select assert_eq((select count(*) > 100 from herb_monographs), true, '登录用户能读全部（草稿也能读）');
select assert_eq(is_monograph_reviewer(), false, 'Hao 还不是审核人');
select assert_eq((select count(*) from herb_monograph_revisions), 0::bigint, '不是审核人读不到修改记录');
reset role;
set role anon; set request.jwt.claim.sub = '';
select assert_eq((select count(*) from herb_monographs), 0::bigint, '未登录读不到草稿');
reset role;

-- ---- 谁都不能直接写 ----
:as_hao;
select assert_raises(format('update herb_monographs set nature = %L where herb_id = %L', '热', :'maidong'), 'permission denied', '不能直接改资料');
select assert_raises(format('insert into monograph_reviewers values (%L, %L)', '00000000-0000-0000-0000-00000000000a', '我'), 'permission denied', '不能自己加成审核人');
select assert_raises(format('select review_herb_monograph(%L, %L::jsonb, %L)', :'maidong', '{}', 'save'), '只有审核人', '不是审核人不能调函数');
reset role;
select assert_eq(has_function_privilege('anon', 'public.review_herb_monograph(uuid, jsonb, text, text)', 'execute'), false, 'anon 不能调审核函数');

-- ---- 审核人：Tina（display_name 李医生）----
insert into monograph_reviewers (user_id, display_name) values ('00000000-0000-0000-0000-00000000000c', '李医生');
:as_tina;
select assert_eq(is_monograph_reviewer(), true, 'Tina 是审核人');
select (select to_jsonb(m) from herb_monographs m where herb_id = :'maidong') as content \gset

-- 格式不对的保存不了
select assert_raises(format('select review_herb_monograph(%L, %L::jsonb, %L)', :'maidong', jsonb_set(:'content'::jsonb, '{nature}', '"很冷"'), 'save'), '「性」只能写', '性写错');
select assert_raises(format('select review_herb_monograph(%L, %L::jsonb, %L)', :'maidong', jsonb_set(:'content'::jsonb, '{flavors}', '["甜"]'), 'save'), '「味」只能写', '味写错');
select assert_raises(format('select review_herb_monograph(%L, %L::jsonb, %L)', :'maidong', jsonb_set(:'content'::jsonb, '{meridians}', '[]'), 'save'), '「归经」只能写', '没有归经');
select assert_raises(format('select review_herb_monograph(%L, %L::jsonb, %L)', :'maidong', jsonb_set(:'content'::jsonb, '{traditional_use}', '"养阴生津，每次 10g"'), 'save'), '不写用量', '写了用量');
select assert_raises(format('select review_herb_monograph(%L, %L::jsonb, %L)', :'maidong', jsonb_set(:'content'::jsonb, '{cautions}', '"不超过 3 钱"'), 'save'), '不写用量', '使用注意里写了用量');
select assert_raises(format('select review_herb_monograph(%L, %L::jsonb, %L)', :'maidong', :'content', 'delete'), '操作不对', '只有三种操作');
select assert_raises(format('select review_herb_monograph(%L, %L::jsonb, %L)', :'maidong', :'content', 'flag'), '请写一下', '有问题要写备注');

-- 先存着：改了内容，还是草稿
select assert_eq(review_herb_monograph(:'maidong', jsonb_set(:'content'::jsonb, '{regions}', '"浙江慈溪（浙麦冬）、四川绵阳（川麦冬）"'), 'save'), 'draft', '先存着');
select assert_eq((select regions from herb_monographs where herb_id = :'maidong'), '浙江慈溪（浙麦冬）、四川绵阳（川麦冬）', '改的内容存下了');

-- 有问题：只记备注，不改内容
select assert_eq(review_herb_monograph(:'maidong', '{}'::jsonb, 'flag', '产区要再查'), 'draft', '有问题');
select assert_eq((select flag_note from herb_monographs where herb_id = :'maidong'), '产区要再查', '备注存下了');

-- 通过：记审核人、日期，清掉「有问题」
select (select to_jsonb(m) from herb_monographs m where herb_id = :'maidong') as content \gset
select assert_eq(review_herb_monograph(:'maidong', :'content', 'approve'), 'reviewed', '通过');
select assert_eq((select reviewed_by || ':' || (reviewed_at = current_date) || ':' || coalesce(flag_note, '无') from herb_monographs where herb_id = :'maidong'), '李医生:true:无', '审核人和日期');

-- 审核过的：没改内容再存，还是已审核；改了内容退回草稿
select assert_eq(review_herb_monograph(:'maidong', :'content', 'save'), 'reviewed', '没改内容不退回');
select assert_eq(review_herb_monograph(:'maidong', jsonb_set(:'content'::jsonb, '{storage}', '"密封，置阴凉干燥处"'), 'save'), 'draft', '改了内容退回草稿');
select assert_eq((select reviewed_by is null and reviewed_at is null from herb_monographs where herb_id = :'maidong'), true, '退回草稿后审核人清空');

-- 炮制品没有毒性字段也能通过（显示原药材的）
select (select to_jsonb(m) from herb_monographs m where herb_id = :'zgc') as zgc_content \gset
select assert_eq(review_herb_monograph(:'zgc', :'zgc_content', 'approve'), 'reviewed', '炙甘草通过');

-- 修改记录：每次操作一条，只能看不能改
select assert_eq((select string_agg(action, ',' order by id) from herb_monograph_revisions where herb_id = :'maidong'), 'save,flag,approve,save,save', '麦冬的修改记录');
select assert_eq((select after->>'storage' from herb_monograph_revisions where herb_id = :'maidong' order by id desc limit 1), '密封，置阴凉干燥处', '记录里有改之后的内容');
select assert_eq((select reviewer_name from herb_monograph_revisions order by id limit 1), '李医生', '记录里有审核人');
select assert_raises($$update herb_monograph_revisions set note = '改记录'$$, 'permission denied', '修改记录改不了');
select assert_raises($$delete from herb_monograph_revisions$$, 'permission denied', '修改记录删不掉');
reset role;
select assert_eq((select count(*) from herb_monograph_revisions), 6::bigint, '修改记录都还在');

-- ---- 未登录只能读已审核的 ----
set role anon; set request.jwt.claim.sub = '';
select assert_eq((select count(*) from herb_monographs), 1::bigint, '未登录只读到已审核的 1 味（炙甘草）');
select assert_eq((select nature from herb_monographs), '平', '未登录能读资料本身');
select assert_raises($$select flag_note from herb_monographs$$, 'permission denied', '未登录读不到内部备注 flag_note');
select assert_raises($$select check_note from herb_monographs$$, 'permission denied', '未登录读不到内部备注 check_note');
select assert_raises($$select count(*) from monograph_reviewers$$, 'permission denied', '未登录读不到审核人');
reset role;
