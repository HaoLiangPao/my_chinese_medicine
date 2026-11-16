-- =============================================================================
-- 学堂：每日一题、题库、复习。设计见 docs/design/0020-learn-daily-quiz.md
--
-- quiz_questions：题库，全站一份。谁都能读（包括没登录的）；谁都不能写，只由 migration 写入
--                 （题目在 supabase/data/quiz-questions.json，下面的数据块由 scripts/gen-quiz-questions.mjs 生成）
-- quiz_attempts： 每个人的作答记录。只能读、插自己的；不能改、不能删。对错由触发器按题库的答案算，不信任客户端
-- 只加新表和新函数，线上的旧代码不受影响。
-- =============================================================================

create table public.quiz_questions (
  id          text primary key,
  kind        text not null,
  stem        text not null,
  options     text[] not null,
  answer      smallint not null,            -- 正确选项在 options 里的下标（从 0 开始）
  explanation text not null,                -- 解析：一两句，说明出处，不大段引原文
  source      text not null,                -- 出处，比如《黄帝内经·素问·阴阳应象大论》、某某教材通行说法
  topics      text[] not null,              -- 主题，第一个是主主题（web/src/lib/quiz.ts 的 QUIZ_TOPICS）
  difficulty  smallint not null,
  status      text not null default 'draft',
  reviewed_by text,
  reviewed_at date,
  updated_at  timestamptz not null default now(),

  constraint qq_id check (id ~ '^[a-z]+-[0-9]{3}$'),
  constraint qq_kind check (kind in ('single', 'judge')),
  constraint qq_stem check (char_length(btrim(stem)) between 4 and 200),
  constraint qq_options check (cardinality(options) between 2 and 5 and array_position(options, null) is null and '' <> all (options)),
  constraint qq_judge check (kind <> 'judge' or options = array['对', '错']),
  constraint qq_answer check (answer >= 0 and answer < cardinality(options)),
  constraint qq_explanation check (char_length(btrim(explanation)) between 4 and 300),
  constraint qq_source check (char_length(btrim(source)) between 2 and 120),
  constraint qq_topics check (cardinality(topics) between 1 and 4 and array_position(topics, null) is null
    and topics <@ array['yinyang', 'wuxing', 'zangfu', 'qixue', 'jingluo', 'sizhen', 'zhongyao', 'fangji', 'jingdian', 'yangsheng']),
  constraint qq_difficulty check (difficulty between 1 and 3),
  -- retired：发现有错、下架（不删，作答记录还指向它）
  constraint qq_status check (status in ('draft', 'reviewed', 'retired')),
  constraint qq_reviewed check (status <> 'reviewed' or (btrim(coalesce(reviewed_by, '')) <> '' and reviewed_at is not null))
);

alter table public.quiz_questions enable row level security;
create policy qq_read on public.quiz_questions for select to anon, authenticated using (true);

create table public.quiz_attempts (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  question_id text not null references public.quiz_questions(id),
  chosen      smallint not null,
  correct     boolean not null default false,  -- 触发器按题库的答案算
  mode        text not null check (mode in ('daily', 'practice', 'review')),
  daily_day   date,                            -- 每日一题那天（多伦多日期）；只有 mode = 'daily' 才有
  answered_at timestamptz not null default now(),
  constraint qa_daily check ((mode = 'daily') = (daily_day is not null))
);
-- 每日一题每人每天只记一次（连续打卡天数按它算）
create unique index quiz_attempts_one_daily on public.quiz_attempts (user_id, daily_day) where daily_day is not null;
create index on public.quiz_attempts (user_id, answered_at);

alter table public.quiz_attempts enable row level security;
create policy qa_read on public.quiz_attempts for select to authenticated using (user_id = auth.uid());
-- 每日一题只能记「今天」（多伦多），不能补以前的打卡
create policy qa_insert on public.quiz_attempts for insert to authenticated
  with check (user_id = auth.uid() and (daily_day is null or daily_day = (now() at time zone 'America/Toronto')::date));

-- 题库谁都不能写；作答只能插这几列（user_id、correct、answered_at、id 只能用默认值 / 触发器算的），没有 update / delete
do $$
declare r text;
begin
  foreach r in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('revoke all on public.quiz_questions, public.quiz_attempts from %I', r);
      execute format('grant select on public.quiz_questions to %I', r);
    end if;
  end loop;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    grant select on public.quiz_attempts to authenticated;
    grant insert (question_id, chosen, mode, daily_day) on public.quiz_attempts to authenticated;
  end if;
end $$;

-- 插入前：按题库的答案算对错；下架的题不能答；每人 24 小时最多 500 次（防刷，App 正常用不会碰到）
create or replace function public.quiz_attempt_grade()
returns trigger
language plpgsql set search_path = public, pg_temp
as $$
declare q record;
begin
  select answer, cardinality(options) as n, status into q from public.quiz_questions where id = new.question_id;
  if not found or q.status = 'retired' then raise exception '没有这道题'; end if;
  if new.chosen is null or new.chosen < 0 or new.chosen >= q.n then raise exception '没有这个选项'; end if;
  new.correct := new.chosen = q.answer;
  if (select count(*) from public.quiz_attempts a
      where a.user_id = new.user_id and a.answered_at > now() - interval '24 hours') >= 500 then
    raise exception '答题次数太多了，明天再来';
  end if;
  return new;
end;
$$;
create trigger quiz_attempts_grade before insert on public.quiz_attempts
for each row execute function public.quiz_attempt_grade();

-- 触发器函数谁都不能直接调用
do $$
declare f regprocedure; r text;
begin
  for f in select p.oid::regprocedure from pg_proc p
           where p.pronamespace = 'public'::regnamespace and p.proname = 'quiz_attempt_grade' loop
    execute format('revoke execute on function %s from public', f);
    foreach r in array array['anon', 'authenticated'] loop
      if exists (select 1 from pg_roles where rolname = r) then execute format('revoke execute on function %s from %I', f, r); end if;
    end loop;
  end loop;
end $$;

-- >>> 题库（scripts/gen-quiz-questions.mjs 生成，不要手改）
-- 来源：supabase/data/quiz-questions.json（123 题）。按 id upsert，可以重复执行；不删题（下架用 status = 'retired'）
insert into public.quiz_questions (id, kind, stem, options, answer, explanation, source, topics, difficulty, status, reviewed_by, reviewed_at)
select q.id, q.kind, q.stem, q.options, q.answer, q.explanation, q.source, q.topics, q.difficulty, q.status, q.reviewed_by, q.reviewed_at
from jsonb_to_recordset($quiz$[
{"id":"yinyang-001","kind":"single","stem":"「阴阳」最初的含义是指什么？","options":["日光的向背","男女之别","寒热之分","上下之位"],"answer":0,"explanation":"阴阳最初指日光的向背：向日为阳，背日为阴；后来才引申为概括事物相互对立又相互联系的两个方面。","source":"中医基础理论教材通行说法","topics":["yinyang"],"difficulty":1,"status":"draft","reviewed_by":null,"reviewed_at":null},
{"id":"yinyang-002","kind":"single","stem":"按阴阳的一般属性，下列哪一项属阳？","options":["寒冷","上升","静止","晦暗"],"answer":1,"explanation":"一般来说，运动的、上升的、温热的、明亮的、向外的属阳；相对静止的、下降的、寒冷的、晦暗的、向内的属阴。","source":"中医基础理论教材通行说法","topics":["yinyang"],"difficulty":1,"status":"draft","reviewed_by":null,"reviewed_at":null},
{"id":"yinyang-003","kind":"single","stem":"「阴在内，阳之守也；阳在外，阴之使也」主要说明阴阳之间的哪种关系？","options":["对立制约","消长平衡","互根互用","相互转化"],"answer":2,"explanation":"阴在内为阳守持，阳在外为阴役使，两者相互依存、相互为用，说的是阴阳互根互用。","source":"《黄帝内经·素问·阴阳应象大论》","topics":["yinyang"],"difficulty":2,"status":"draft","reviewed_by":null,"reviewed_at":null},
{"id":"yinyang-004","kind":"single","stem":"「重阴必阳，重阳必阴」说的是阴阳之间的哪种关系？","options":["阴阳交感","互根互用","对立制约","相互转化"],"answer":3,"explanation":"阴或阳发展到极点，可以向相反的一方转化。","source":"《黄帝内经·素问·阴阳应象大论》","topics":["yinyang"],"difficulty":2,"status":"draft","reviewed_by":null,"reviewed_at":null},
{"id":"yinyang-005","kind":"single","stem":"「阳胜则热，阴胜则寒」中，阳偏盛时多表现为什么？","options":["热","寒","燥","湿"],"answer":0,"explanation":"阴阳一方偏盛，会表现出它自己的属性：阳偏盛多见热象，阴偏盛多见寒象。","source":"《黄帝内经·素问·阴阳应象大论》","topics":["yinyang"],"difficulty":1,"status":"draft","reviewed_by":null,"reviewed_at":null},
{"id":"yinyang-006","kind":"single","stem":"按《素问·金匮真言论》对一天的划分，「平旦至日中」（清晨到中午）属于？","options":["阳中之阳","阳中之阴","阴中之阴","阴中之阳"],"answer":0,"explanation":"书中说平旦至日中为阳中之阳，日中至黄昏为阳中之阴，合夜至鸡鸣为阴中之阴，鸡鸣至平旦为阴中之阳。","source":"《黄帝内经·素问·金匮真言论》","topics":["yinyang"],"difficulty":2,"status":"draft","reviewed_by":null,"reviewed_at":null},
{"id":"yinyang-007","kind":"judge","stem":"判断：按人体部位划分阴阳，背部属阳，腹部属阴。","options":["对","错"],"answer":0,"explanation":"《素问·金匮真言论》说「背为阳，腹为阴」。","source":"《黄帝内经·素问·金匮真言论》","topics":["yinyang"],"difficulty":1,"status":"draft","reviewed_by":null,"reviewed_at":null},
{"id":"yinyang-008","kind":"single","stem":"按脏腑划分阴阳，下列说法正确的是？","options":["五脏属阳，六腑属阴","五脏属阴，六腑属阳","五脏六腑都属阴","五脏六腑都属阳"],"answer":1,"explanation":"五脏藏精气而不泻，属阴；六腑传化物而不藏，属阳。","source":"《黄帝内经·素问·金匮真言论》","topics":["yinyang","zangfu"],"difficulty":1,"status":"draft","reviewed_by":null,"reviewed_at":null},
{"id":"yinyang-009","kind":"single","stem":"「阴平阳秘，精神乃治」出自《素问》的哪一篇？","options":["上古天真论","灵兰秘典论","生气通天论","四气调神大论"],"answer":2,"explanation":"这句话是说阴气平和、阳气固密，人的精神才能正常。","source":"《黄帝内经·素问·生气通天论》","topics":["yinyang","jingdian"],"difficulty":2,"status":"draft","reviewed_by":null,"reviewed_at":null},
{"id":"yinyang-010","kind":"single","stem":"按《素问·金匮真言论》，五脏中被称为「阳中之阳」的是？","options":["肺","肝","肾","心"],"answer":3,"explanation":"心、肺都在胸中（背为阳），其中心为阳中之阳，肺为阳中之阴。","source":"《黄帝内经·素问·金匮真言论》","topics":["yinyang","zangfu"],"difficulty":3,"status":"draft","reviewed_by":null,"reviewed_at":null},
{"id":"yinyang-011","kind":"judge","stem":"判断：一年四季寒暑往来，体现了阴阳的消长。","options":["对","错"],"answer":0,"explanation":"从冬到夏，阳长阴消；从夏到冬，阴长阳消，是阴阳消长的典型例子。","source":"中医基础理论教材通行说法","topics":["yinyang"],"difficulty":1,"status":"draft","reviewed_by":null,"reviewed_at":null},
{"id":"yinyang-012","kind":"single","stem":"「孤阴不生，独阳不长」主要强调阴阳之间的哪种关系？","options":["互根互用","相互转化","对立制约","消长平衡"],"answer":0,"explanation":"阴和阳任何一方都不能脱离另一方单独存在，说的是阴阳互根。","source":"中医基础理论教材通行说法","topics":["yinyang"],"difficulty":2,"status":"draft","reviewed_by":null,"reviewed_at":null},
{"id":"wuxing-001","kind":"single","stem":"五行相生：木生火，火生什么？","options":["金","土","水","木"],"answer":1,"explanation":"五行相生的顺序是木生火、火生土、土生金、金生水、水生木。","source":"中医基础理论教材通行说法","topics":["wuxing"],"difficulty":1,"status":"draft","reviewed_by":null,"reviewed_at":null},
{"id":"wuxing-002","kind":"single","stem":"五行相克：木克什么？","options":["火","金","土","水"],"answer":2,"explanation":"五行相克的顺序是木克土、土克水、水克火、火克金、金克木。","source":"中医基础理论教材通行说法","topics":["wuxing"],"difficulty":1,"status":"draft","reviewed_by":null,"reviewed_at":null},
{"id":"wuxing-003","kind":"single","stem":"在五行和五脏的对应里，肝属于哪一行？","options":["金","火","土","木"],"answer":3,"explanation":"肝属木，心属火，脾属土，肺属金，肾属水。","source":"《黄帝内经·素问·阴阳应象大论》","topics":["wuxing","zangfu"],"difficulty":1,"status":"draft","reviewed_by":null,"reviewed_at":null},
{"id":"wuxing-004","kind":"single","stem":"五行中的「水」对应哪一脏？","options":["肾","肺","脾","心"],"answer":0,"explanation":"肝属木，心属火，脾属土，肺属金，肾属水。","source":"《黄帝内经·素问·阴阳应象大论》","topics":["wuxing","zangfu"],"difficulty":1,"status":"draft","reviewed_by":null,"reviewed_at":null},
{"id":"wuxing-005","kind":"single","stem":"按《素问·宣明五气》的「五味所入」，苦味先入哪一脏？","options":["肝","心","脾","肾"],"answer":1,"explanation":"书中说酸入肝，辛入肺，苦入心，咸入肾，甘入脾。","source":"《黄帝内经·素问·宣明五气》","topics":["wuxing","zhongyao"],"difficulty":2,"status":"draft","reviewed_by":null,"reviewed_at":null},
{"id":"wuxing-006","kind":"single","stem":"五行中的「金」对应五色中的哪一色？","options":["青","赤","白","黑"],"answer":2,"explanation":"木青、火赤、土黄、金白、水黑。","source":"《黄帝内经·素问·阴阳应象大论》","topics":["wuxing"],"difficulty":1,"status":"draft","reviewed_by":null,"reviewed_at":null},
{"id":"wuxing-007","kind":"single","stem":"按五行归类，五志中的「怒」与哪一脏相应？","options":["肾","心","肺","肝"],"answer":3,"explanation":"肝在志为怒，心为喜，脾为思，肺为忧，肾为恐。","source":"《黄帝内经·素问·阴阳应象大论》","topics":["wuxing","zangfu"],"difficulty":1,"status":"draft","reviewed_by":null,"reviewed_at":null},
{"id":"wuxing-008","kind":"single","stem":"按五行归类，肾开窍于哪里？","options":["耳","舌","鼻","目"],"answer":0,"explanation":"肝开窍于目，心开窍于舌，脾开窍于口，肺开窍于鼻，肾开窍于耳。","source":"《黄帝内经·素问·阴阳应象大论》","topics":["wuxing","zangfu"],"difficulty":2,"status":"draft","reviewed_by":null,"reviewed_at":null},
{"id":"wuxing-009","kind":"single","stem":"五季中的「长夏」对应五行中的哪一行？","options":["木","土","火","金"],"answer":1,"explanation":"春属木，夏属火，长夏属土，秋属金，冬属水。","source":"中医基础理论教材通行说法","topics":["wuxing"],"difficulty":2,"status":"draft","reviewed_by":null,"reviewed_at":null},
{"id":"wuxing-010","kind":"single","stem":"五方中的「北方」对应五行中的哪一行？","options":["木","火","水","金"],"answer":2,"explanation":"东方属木，南方属火，中央属土，西方属金，北方属水。","source":"中医基础理论教材通行说法","topics":["wuxing"],"difficulty":1,"status":"draft","reviewed_by":null,"reviewed_at":null},
{"id":"wuxing-011","kind":"single","stem":"五行的「相侮」指的是什么？","options":["相克太过","母病及子","相生不及","反向克制（反克）"],"answer":3,"explanation":"相乘是相克太过；相侮是反过来克制，比如本来金克木，木过强时反过来侮金。","source":"中医基础理论教材通行说法","topics":["wuxing"],"difficulty":3,"status":"draft","reviewed_by":null,"reviewed_at":null},
{"id":"wuxing-012","kind":"single","stem":"五行的「相乘」指的是什么？","options":["相克太过","反向克制","相生太过","子病及母"],"answer":0,"explanation":"相乘是一行对它所克的那一行克制太过，超出正常的程度。","source":"中医基础理论教材通行说法","topics":["wuxing"],"difficulty":3,"status":"draft","reviewed_by":null,"reviewed_at":null},
{"id":"zangfu-001","kind":"single","stem":"五脏中「主血脉」的是？","options":["肝","心","脾","肺"],"answer":1,"explanation":"心主血脉，推动血液在脉中运行。","source":"中医基础理论教材通行说法","topics":["zangfu"],"difficulty":1,"status":"draft","reviewed_by":null,"reviewed_at":null},
{"id":"zangfu-002","kind":"single","stem":"五脏中「主气、司呼吸」的是？","options":["心","脾","肺","肾"],"answer":2,"explanation":"肺主气、司呼吸，吸入清气，呼出浊气。","source":"中医基础理论教材通行说法","topics":["zangfu"],"difficulty":1,"status":"draft","reviewed_by":null,"reviewed_at":null},
{"id":"zangfu-003","kind":"single","stem":"五脏中「主运化」，把饮食化为精微并输布全身的是？","options":["肝","肾","心","脾"],"answer":3,"explanation":"脾主运化，把饮食化为水谷精微，再输送到全身。","source":"中医基础理论教材通行说法","topics":["zangfu"],"difficulty":1,"status":"draft","reviewed_by":null,"reviewed_at":null},
{"id":"zangfu-004","kind":"single","stem":"「主疏泄」「主藏血」是哪一脏的功能？","options":["肝","心","脾","肺"],"answer":0,"explanation":"肝主疏泄，调畅全身气机；肝又主藏血，贮藏和调节血量。","source":"中医基础理论教材通行说法","topics":["zangfu"],"difficulty":1,"status":"draft","reviewed_by":null,"reviewed_at":null},
{"id":"zangfu-005","kind":"single","stem":"被称为「先天之本」的是哪一脏？","options":["脾","肾","心","肺"],"answer":1,"explanation":"肾藏先天之精，是生长发育和生殖的根本，所以称「先天之本」；脾称「后天之本」。","source":"中医基础理论教材通行说法","topics":["zangfu"],"difficulty":1,"status":"draft","reviewed_by":null,"reviewed_at":null},
{"id":"zangfu-006","kind":"single","stem":"被称为「后天之本」的是哪一脏？","options":["肾","肝","脾","肺"],"answer":2,"explanation":"脾运化饮食，化生气血，人出生以后的营养都靠它，所以称「后天之本」。","source":"中医基础理论教材通行说法","topics":["zangfu"],"difficulty":1,"status":"draft","reviewed_by":null,"reviewed_at":null},
{"id":"zangfu-007","kind":"single","stem":"《素问·灵兰秘典论》称为「君主之官」的是？","options":["肺","脾","肝","心"],"answer":3,"explanation":"原文说「心者，君主之官也，神明出焉」。","source":"《黄帝内经·素问·灵兰秘典论》","topics":["zangfu","jingdian"],"difficulty":2,"status":"draft","reviewed_by":null,"reviewed_at":null},
{"id":"zangfu-008","kind":"single","stem":"《素问·灵兰秘典论》称为「相傅之官」的是？","options":["肺","肝","脾","肾"],"answer":0,"explanation":"原文说「肺者，相傅之官，治节出焉」。","source":"《黄帝内经·素问·灵兰秘典论》","topics":["zangfu","jingdian"],"difficulty":2,"status":"draft","reviewed_by":null,"reviewed_at":null},
{"id":"zangfu-009","kind":"single","stem":"下列哪一个不属于六腑？","options":["胆","脑","膀胱","三焦"],"answer":1,"explanation":"六腑是胆、胃、小肠、大肠、膀胱、三焦；脑属于奇恒之腑。","source":"中医基础理论教材通行说法","topics":["zangfu"],"difficulty":2,"status":"draft","reviewed_by":null,"reviewed_at":null},
{"id":"zangfu-010","kind":"single","stem":"既属于六腑、又属于奇恒之腑的是？","options":["胃","膀胱","胆","小肠"],"answer":2,"explanation":"胆参与饮食的消化，属六腑；胆汁是「精汁」，和其他腑传化的东西不同，所以又归入奇恒之腑。","source":"中医基础理论教材通行说法","topics":["zangfu"],"difficulty":3,"status":"draft","reviewed_by":null,"reviewed_at":null},
{"id":"zangfu-011","kind":"single","stem":"与心相表里的腑是？","options":["胃","膀胱","大肠","小肠"],"answer":3,"explanation":"心与小肠、肺与大肠、脾与胃、肝与胆、肾与膀胱相表里。","source":"中医基础理论教材通行说法","topics":["zangfu"],"difficulty":2,"status":"draft","reviewed_by":null,"reviewed_at":null},
{"id":"zangfu-012","kind":"single","stem":"因为位置在五脏中最高，被称为「华盖」的是？","options":["肺","心","肝","脾"],"answer":0,"explanation":"肺位于胸腔，覆盖在其他脏腑之上，所以称「华盖」。","source":"中医基础理论教材通行说法","topics":["zangfu"],"difficulty":2,"status":"draft","reviewed_by":null,"reviewed_at":null},
{"id":"zangfu-013","kind":"single","stem":"「主受纳、腐熟水谷」的是？","options":["脾","胃","小肠","大肠"],"answer":1,"explanation":"胃接受饮食并进行初步消化，称为受纳、腐熟水谷。","source":"中医基础理论教材通行说法","topics":["zangfu"],"difficulty":1,"status":"draft","reviewed_by":null,"reviewed_at":null},
{"id":"qixue-001","kind":"single","stem":"「气为血之___，血为气之母」，空格处是？","options":["母","本","帅","源"],"answer":2,"explanation":"气能生血、行血、摄血，所以说气为血之帅；血能载气、养气，所以说血为气之母。","source":"中医基础理论教材通行说法","topics":["qixue"],"difficulty":1,"status":"draft","reviewed_by":null,"reviewed_at":null},
{"id":"qixue-002","kind":"single","stem":"下列哪一项不是人体之气的来源？","options":["先天之精气","水谷之精气","自然界的清气","汗液"],"answer":3,"explanation":"人体之气来源于父母的先天之精、饮食化生的水谷精气和肺吸入的自然界清气。","source":"中医基础理论教材通行说法","topics":["qixue"],"difficulty":1,"status":"draft","reviewed_by":null,"reviewed_at":null},
{"id":"qixue-003","kind":"single","stem":"积聚在胸中，由肺吸入的清气和脾胃化生的水谷精气结合而成的气叫？","options":["宗气","元气","营气","卫气"],"answer":0,"explanation":"宗气积于胸中，由清气和水谷精气结合而成。","source":"中医基础理论教材通行说法","topics":["qixue"],"difficulty":2,"status":"draft","reviewed_by":null,"reviewed_at":null},
{"id":"qixue-004","kind":"single","stem":"人体最根本的气，由肾中先天之精化生的是？","options":["宗气","元气","营气","卫气"],"answer":1,"explanation":"元气（又称原气）由肾中先天之精化生，是人体生命活动的原动力。","source":"中医基础理论教材通行说法","topics":["qixue"],"difficulty":2,"status":"draft","reviewed_by":null,"reviewed_at":null},
{"id":"qixue-005","kind":"single","stem":"行于脉外、护卫肌表的气是？","options":["营气","宗气","卫气","元气"],"answer":2,"explanation":"卫气行于脉外，有护卫肌表、温养肌肤的作用；营气行于脉中。","source":"中医基础理论教材通行说法","topics":["qixue"],"difficulty":2,"status":"draft","reviewed_by":null,"reviewed_at":null},
{"id":"qixue-006","kind":"single","stem":"「营在脉中，卫在脉外」出自哪里？","options":["《难经》","《素问·上古天真论》","《伤寒论》","《灵枢·营卫生会》"],"answer":3,"explanation":"《灵枢·营卫生会》讲营气和卫气的生成和运行：营在脉中，卫在脉外。","source":"《黄帝内经·灵枢·营卫生会》","topics":["qixue","jingdian"],"difficulty":3,"status":"draft","reviewed_by":null,"reviewed_at":null},
{"id":"qixue-007","kind":"judge","stem":"判断：气的固摄作用可以防止血液溢出脉外。","options":["对","错"],"answer":0,"explanation":"气的固摄作用能控制血液在脉中运行，也能控制汗液、尿液等的排泄。","source":"中医基础理论教材通行说法","topics":["qixue"],"difficulty":1,"status":"draft","reviewed_by":null,"reviewed_at":null},
{"id":"qixue-008","kind":"judge","stem":"判断：津液中，质地清稀、流动性较大的叫「津」，质地稠厚、流动性较小的叫「液」。","options":["对","错"],"answer":0,"explanation":"津清稀，多散布在体表和肌肉；液稠厚，多灌注在关节、脏腑、脑髓。","source":"中医基础理论教材通行说法","topics":["qixue"],"difficulty":2,"status":"draft","reviewed_by":null,"reviewed_at":null},
{"id":"qixue-009","kind":"single","stem":"按《素问·宣明五气》的「五脏化液」，泪属于哪一脏？","options":["肝","肺","心","肾"],"answer":0,"explanation":"书中说心为汗，肺为涕，肝为泪，脾为涎，肾为唾。","source":"《黄帝内经·素问·宣明五气》","topics":["qixue","zangfu"],"difficulty":2,"status":"draft","reviewed_by":null,"reviewed_at":null},
{"id":"qixue-010","kind":"judge","stem":"判断：「津血同源」是说津液和血都来源于饮食化生的水谷精微，可以相互转化。","options":["对","错"],"answer":0,"explanation":"津液和血都由水谷精微化生，津液渗入脉中可以成为血的一部分，所以说津血同源。","source":"中医基础理论教材通行说法","topics":["qixue"],"difficulty":1,"status":"draft","reviewed_by":null,"reviewed_at":null},
{"id":"qixue-011","kind":"single","stem":"「中焦受气取汁，变化而赤，是谓血」出自哪里？","options":["《素问·上古天真论》","《灵枢·决气》","《金匮要略》","《神农本草经》"],"answer":1,"explanation":"这句讲血的生成：中焦脾胃吸收饮食精微，经过变化成为红色的血。","source":"《黄帝内经·灵枢·决气》","topics":["qixue","jingdian"],"difficulty":3,"status":"draft","reviewed_by":null,"reviewed_at":null},
{"id":"jingluo-001","kind":"single","stem":"十二正经加上任脉和督脉，合称什么？","options":["奇经八脉","十五络脉","十四经","十二经别"],"answer":2,"explanation":"任、督二脉有自己的穴位，和十二正经合称「十四经」。","source":"《经络腧穴学》教材通行说法；穴位名称和代码见世界卫生组织《标准针灸经穴定位（西太平洋地区）》","topics":["jingluo"],"difficulty":1,"status":"draft","reviewed_by":null,"reviewed_at":null},
{"id":"jingluo-002","kind":"single","stem":"奇经八脉中被称为「阳脉之海」的是？","options":["任脉","带脉","冲脉","督脉"],"answer":3,"explanation":"督脉行于背部正中，总督一身的阳经，称「阳脉之海」；任脉称「阴脉之海」。","source":"《经络腧穴学》教材通行说法；穴位名称和代码见世界卫生组织《标准针灸经穴定位（西太平洋地区）》","topics":["jingluo"],"difficulty":2,"status":"draft","reviewed_by":null,"reviewed_at":null},
{"id":"jingluo-003","kind":"single","stem":"奇经八脉中被称为「阴脉之海」的是？","options":["任脉","督脉","冲脉","阴维脉"],"answer":0,"explanation":"任脉行于胸腹正中，总任一身的阴经，称「阴脉之海」。","source":"《经络腧穴学》教材通行说法；穴位名称和代码见世界卫生组织《标准针灸经穴定位（西太平洋地区）》","topics":["jingluo"],"difficulty":2,"status":"draft","reviewed_by":null,"reviewed_at":null},
{"id":"jingluo-004","kind":"single","stem":"合谷穴属于哪条经脉？","options":["手太阴肺经","手阳明大肠经","足阳明胃经","手少阳三焦经"],"answer":1,"explanation":"合谷是手阳明大肠经的穴位，国际代码 LI4，在手背第 1、2 掌骨之间。","source":"《经络腧穴学》教材通行说法；穴位名称和代码见世界卫生组织《标准针灸经穴定位（西太平洋地区）》","topics":["jingluo"],"difficulty":1,"status":"draft","reviewed_by":null,"reviewed_at":null},
{"id":"jingluo-005","kind":"single","stem":"足三里穴属于哪条经脉？","options":["足太阴脾经","足少阳胆经","足阳明胃经","足太阳膀胱经"],"answer":2,"explanation":"足三里是足阳明胃经的穴位，国际代码 ST36。","source":"《经络腧穴学》教材通行说法；穴位名称和代码见世界卫生组织《标准针灸经穴定位（西太平洋地区）》","topics":["jingluo"],"difficulty":1,"status":"draft","reviewed_by":null,"reviewed_at":null},
{"id":"jingluo-006","kind":"single","stem":"内关穴属于哪条经脉？","options":["手少阳三焦经","手少阴心经","手太阴肺经","手厥阴心包经"],"answer":3,"explanation":"内关是手厥阴心包经的穴位，国际代码 PC6。","source":"《经络腧穴学》教材通行说法；穴位名称和代码见世界卫生组织《标准针灸经穴定位（西太平洋地区）》","topics":["jingluo"],"difficulty":2,"status":"draft","reviewed_by":null,"reviewed_at":null},
{"id":"jingluo-007","kind":"single","stem":"三阴交穴归属于哪条经脉？","options":["足太阴脾经","足少阴肾经","足厥阴肝经","任脉"],"answer":0,"explanation":"三阴交是足太阴脾经的穴位（SP6），因为足三阴经在这里交会而得名。","source":"《经络腧穴学》教材通行说法；穴位名称和代码见世界卫生组织《标准针灸经穴定位（西太平洋地区）》","topics":["jingluo"],"difficulty":2,"status":"draft","reviewed_by":null,"reviewed_at":null},
{"id":"jingluo-008","kind":"single","stem":"位于头顶正中的百会穴属于哪条经脉？","options":["任脉","督脉","足太阳膀胱经","足少阳胆经"],"answer":1,"explanation":"百会是督脉的穴位，国际代码 GV20。","source":"《经络腧穴学》教材通行说法；穴位名称和代码见世界卫生组织《标准针灸经穴定位（西太平洋地区）》","topics":["jingluo"],"difficulty":1,"status":"draft","reviewed_by":null,"reviewed_at":null},
{"id":"jingluo-009","kind":"single","stem":"太冲穴属于哪条经脉？","options":["足太阴脾经","足少阴肾经","足厥阴肝经","足阳明胃经"],"answer":2,"explanation":"太冲是足厥阴肝经的穴位，国际代码 LR3，在足背第 1、2 跖骨之间。","source":"《经络腧穴学》教材通行说法；穴位名称和代码见世界卫生组织《标准针灸经穴定位（西太平洋地区）》","topics":["jingluo"],"difficulty":2,"status":"draft","reviewed_by":null,"reviewed_at":null},
{"id":"jingluo-010","kind":"single","stem":"十二经脉的气血流注从哪条经开始？","options":["足厥阴肝经","足太阳膀胱经","手阳明大肠经","手太阴肺经"],"answer":3,"explanation":"十二经脉的气血流注从手太阴肺经开始，依次传到足厥阴肝经，再回到肺经，如环无端。","source":"《经络腧穴学》教材通行说法；穴位名称和代码见世界卫生组织《标准针灸经穴定位（西太平洋地区）》","topics":["jingluo"],"difficulty":2,"status":"draft","reviewed_by":null,"reviewed_at":null},
{"id":"jingluo-011","kind":"single","stem":"按《灵枢·逆顺肥瘦》，手三阴经的走向是？","options":["从胸（脏）走手","从头走足","从手走头","从足走腹"],"answer":0,"explanation":"手三阴从脏走手，手三阳从手走头，足三阳从头走足，足三阴从足走腹（胸）。","source":"《黄帝内经·灵枢·逆顺肥瘦》","topics":["jingluo","jingdian"],"difficulty":3,"status":"draft","reviewed_by":null,"reviewed_at":null},
{"id":"jingluo-012","kind":"single","stem":"足三里穴在哪里？","options":["小腿内侧，内踝尖上 3 寸","小腿前外侧，犊鼻下 3 寸","前臂掌侧，腕横纹上 2 寸","手背，第 1、2 掌骨之间"],"answer":1,"explanation":"足三里在小腿前外侧，犊鼻下 3 寸；内踝尖上 3 寸是三阴交，腕横纹上 2 寸是内关，第 1、2 掌骨之间是合谷。","source":"《经络腧穴学》教材通行说法；穴位名称和代码见世界卫生组织《标准针灸经穴定位（西太平洋地区）》","topics":["jingluo"],"difficulty":2,"status":"draft","reviewed_by":null,"reviewed_at":null},
{"id":"jingluo-013","kind":"single","stem":"「腕掌侧远端横纹上 2 寸，掌长肌腱与桡侧腕屈肌腱之间」是哪个穴位？","options":["合谷","外关","内关","神门"],"answer":2,"explanation":"这是内关的定位；外关在前臂背侧，和内关相对。","source":"《经络腧穴学》教材通行说法；穴位名称和代码见世界卫生组织《标准针灸经穴定位（西太平洋地区）》","topics":["jingluo"],"difficulty":2,"status":"draft","reviewed_by":null,"reviewed_at":null},
{"id":"jingluo-014","kind":"single","stem":"位于足底、是足少阴肾经第一个穴位的是？","options":["然谷","太溪","照海","涌泉"],"answer":3,"explanation":"涌泉在足底，是足少阴肾经的起始穴，国际代码 KI1。","source":"《经络腧穴学》教材通行说法；穴位名称和代码见世界卫生组织《标准针灸经穴定位（西太平洋地区）》","topics":["jingluo"],"difficulty":2,"status":"draft","reviewed_by":null,"reviewed_at":null},
{"id":"sizhen-001","kind":"single","stem":"中医的「四诊」是指什么？","options":["望、闻、问、切","视、触、叩、听","寒、热、虚、实","表、里、阴、阳"],"answer":0,"explanation":"四诊是望诊、闻诊、问诊、切诊，是中医收集病情资料的四种方法。","source":"《中医诊断学》教材通行说法","topics":["sizhen"],"difficulty":1,"status":"draft","reviewed_by":null,"reviewed_at":null},
{"id":"sizhen-002","kind":"single","stem":"「闻诊」包括哪两方面？","options":["看面色和看舌","听声音和嗅气味","问病史和问饮食","按脉和按腹"],"answer":1,"explanation":"闻诊的「闻」既是听，也是嗅：听声音，嗅气味。","source":"《中医诊断学》教材通行说法","topics":["sizhen"],"difficulty":1,"status":"draft","reviewed_by":null,"reviewed_at":null},
{"id":"sizhen-003","kind":"single","stem":"寸口脉诊把寸口分为哪三部？","options":["上、中、下","浮、中、沉","寸、关、尺","左、中、右"],"answer":2,"explanation":"寸口分寸、关、尺三部；浮、中、沉是诊脉时用的三种指力（三候）。","source":"《中医诊断学》教材通行说法","topics":["sizhen"],"difficulty":1,"status":"draft","reviewed_by":null,"reviewed_at":null},
{"id":"sizhen-004","kind":"single","stem":"寸口分候脏腑，通行的说法里右手寸部候哪一脏？","options":["心","肝","肾","肺"],"answer":3,"explanation":"通行的说法是左寸候心、左关候肝、左尺候肾；右寸候肺、右关候脾胃、右尺候肾（命门）。","source":"《中医诊断学》教材通行说法","topics":["sizhen","zangfu"],"difficulty":3,"status":"draft","reviewed_by":null,"reviewed_at":null},
{"id":"sizhen-005","kind":"single","stem":"正常人的舌象一般描述为？","options":["淡红舌、薄白苔","红绛舌、黄厚苔","淡白舌、无苔","青紫舌、灰黑苔"],"answer":0,"explanation":"正常舌象是淡红舌、薄白苔，舌体柔软、活动自如。","source":"《中医诊断学》教材通行说法","topics":["sizhen"],"difficulty":1,"status":"draft","reviewed_by":null,"reviewed_at":null},
{"id":"sizhen-006","kind":"single","stem":"望舌主要观察舌质和什么？","options":["牙齿","舌苔","嘴唇","咽喉"],"answer":1,"explanation":"舌诊分看舌质（舌体）和看舌苔两部分。","source":"《中医诊断学》教材通行说法","topics":["sizhen"],"difficulty":1,"status":"draft","reviewed_by":null,"reviewed_at":null},
{"id":"sizhen-007","kind":"single","stem":"正常脉象的至数，大约是一呼一吸之间跳几次？","options":["二至","三至","四到五至","七至以上"],"answer":2,"explanation":"正常脉象一息（一呼一吸）四到五至，节律均匀，和缓有力。","source":"《中医诊断学》教材通行说法","topics":["sizhen"],"difficulty":2,"status":"draft","reviewed_by":null,"reviewed_at":null},
{"id":"sizhen-008","kind":"single","stem":"《难经·六十一难》说「望而知之谓之___」，空格是？","options":["圣","工","神","巧"],"answer":2,"explanation":"原文是：望而知之谓之神，闻而知之谓之圣，问而知之谓之工，切脉而知之谓之巧。","source":"《难经·六十一难》","topics":["sizhen","jingdian"],"difficulty":2,"status":"draft","reviewed_by":null,"reviewed_at":null},
{"id":"sizhen-009","kind":"single","stem":"「轻取即得，重按稍减而不空」描述的是哪种脉？","options":["数脉","沉脉","迟脉","浮脉"],"answer":3,"explanation":"浮脉脉位表浅，手指轻轻放上就能摸到。","source":"《中医诊断学》教材通行说法","topics":["sizhen"],"difficulty":2,"status":"draft","reviewed_by":null,"reviewed_at":null},
{"id":"sizhen-010","kind":"single","stem":"「轻取不应，重按始得」描述的是哪种脉？","options":["沉脉","浮脉","滑脉","弦脉"],"answer":0,"explanation":"沉脉脉位深，轻按摸不到，用力按下去才能摸到。","source":"《中医诊断学》教材通行说法","topics":["sizhen"],"difficulty":2,"status":"draft","reviewed_by":null,"reviewed_at":null},
{"id":"sizhen-011","kind":"single","stem":"脉来急速、至数比正常快的脉叫？","options":["迟脉","数脉","缓脉","结脉"],"answer":1,"explanation":"数（shuò）脉的至数比正常快；迟脉比正常慢。","source":"《中医诊断学》教材通行说法","topics":["sizhen"],"difficulty":2,"status":"draft","reviewed_by":null,"reviewed_at":null},
{"id":"sizhen-012","kind":"single","stem":"「八纲」指的是什么？","options":["汗、吐、下、和、温、清、消、补","阴阳、表里、寒热、虚实","望、闻、问、切","君、臣、佐、使"],"answer":1,"explanation":"八纲是阴阳、表里、寒热、虚实，是辨证的总纲；汗吐下和温清消补是「八法」。","source":"《中医诊断学》教材通行说法","topics":["sizhen"],"difficulty":3,"status":"draft","reviewed_by":null,"reviewed_at":null},
{"id":"zhongyao-001","kind":"single","stem":"中药的「四气」指的是什么？","options":["升、降、浮、沉","酸、苦、甘、辛","寒、热、温、凉","君、臣、佐、使"],"answer":2,"explanation":"四气又叫四性，是寒、热、温、凉，此外还有性质平和的「平」。","source":"《中药学》教材通行说法","topics":["zhongyao"],"difficulty":1,"status":"draft","reviewed_by":null,"reviewed_at":null},
{"id":"zhongyao-002","kind":"single","stem":"按传统说法，「能散、能行」的是哪一味？","options":["酸","苦","甘","辛"],"answer":3,"explanation":"辛能散能行，甘能补能和能缓，酸能收能涩，苦能泄能燥，咸能下能软。","source":"《中药学》教材通行说法","topics":["zhongyao"],"difficulty":2,"status":"draft","reviewed_by":null,"reviewed_at":null},
{"id":"zhongyao-003","kind":"single","stem":"「十八反」「十九畏」属于哪方面的知识？","options":["配伍禁忌","炮制方法","产地","采收季节"],"answer":0,"explanation":"十八反、十九畏是历代总结的配伍禁忌，说明哪些药一般不放在一起用。","source":"《中药学》教材通行说法","topics":["zhongyao"],"difficulty":2,"status":"draft","reviewed_by":null,"reviewed_at":null},
{"id":"zhongyao-004","kind":"single","stem":"性能功效相似的两种药配合使用、增强原有作用，在「七情」配伍里叫什么？","options":["相使","相须","相畏","相反"],"answer":1,"explanation":"七情是单行、相须、相使、相畏、相杀、相恶、相反；功效相似的药配合增效叫相须。","source":"《中药学》教材通行说法","topics":["zhongyao","fangji"],"difficulty":2,"status":"draft","reviewed_by":null,"reviewed_at":null},
{"id":"zhongyao-005","kind":"single","stem":"按功效分类，麻黄属于哪一类？","options":["补虚药","清热药","解表药","活血化瘀药"],"answer":2,"explanation":"麻黄在《中药学》里归在解表药（发散风寒药）。","source":"《中药学》教材通行说法","topics":["zhongyao"],"difficulty":1,"status":"draft","reviewed_by":null,"reviewed_at":null},
{"id":"zhongyao-006","kind":"single","stem":"按功效分类，人参属于哪一类？","options":["清热药","利水渗湿药","解表药","补虚药"],"answer":3,"explanation":"人参在《中药学》里归在补虚药（补气药）。","source":"《中药学》教材通行说法","topics":["zhongyao"],"difficulty":1,"status":"draft","reviewed_by":null,"reviewed_at":null},
{"id":"zhongyao-007","kind":"single","stem":"黄连的药性（四气）是？","options":["寒","热","温","平"],"answer":0,"explanation":"黄连味苦、性寒。","source":"《中药学》教材通行说法","topics":["zhongyao"],"difficulty":1,"status":"draft","reviewed_by":null,"reviewed_at":null},
{"id":"zhongyao-008","kind":"single","stem":"「炙甘草」通常是用什么辅料炮制的甘草？","options":["醋","蜂蜜","酒","盐"],"answer":1,"explanation":"炙甘草是甘草的蜜炙品，用炼蜜拌炒而成。","source":"《中药学》教材通行说法","topics":["zhongyao"],"difficulty":2,"status":"draft","reviewed_by":null,"reviewed_at":null},
{"id":"zhongyao-009","kind":"judge","stem":"判断：炮制可以降低某些药材的毒性或副作用。","options":["对","错"],"answer":0,"explanation":"比如生半夏有毒，经过炮制后毒性降低；这是加工常识，不是用药指导。","source":"《中药学》教材通行说法","topics":["zhongyao"],"difficulty":1,"status":"draft","reviewed_by":null,"reviewed_at":null},
{"id":"zhongyao-010","kind":"single","stem":"「道地药材」指的是什么？","options":["进口的药材","野生的药材","特定产区出产、品质好的药材","存放多年的药材"],"answer":2,"explanation":"道地药材是在特定产区、用传统方法生产，品质和疗效公认较好的药材。","source":"《中药学》教材通行说法","topics":["zhongyao"],"difficulty":1,"status":"draft","reviewed_by":null,"reviewed_at":null},
{"id":"zhongyao-011","kind":"single","stem":"「归经」说的是什么？","options":["煎药的先后顺序","药物生长的地区","药物的采收时间","药物对某些脏腑经络作用更明显"],"answer":3,"explanation":"归经说明药物作用的部位有选择性，主要作用于某些脏腑经络。","source":"《中药学》教材通行说法","topics":["zhongyao"],"difficulty":2,"status":"draft","reviewed_by":null,"reviewed_at":null},
{"id":"zhongyao-012","kind":"single","stem":"「四大怀药」的产地在今天的哪个省？","options":["河南","四川","浙江","云南"],"answer":0,"explanation":"四大怀药是怀山药、怀牛膝、怀地黄、怀菊花，产自古怀庆府一带（今河南焦作）。","source":"《中药学》教材通行说法","topics":["zhongyao"],"difficulty":2,"status":"draft","reviewed_by":null,"reviewed_at":null},
{"id":"zhongyao-013","kind":"single","stem":"中药的「升降浮沉」说的是什么？","options":["药物的颜色","药物作用的趋向","药物的气味","药物的重量"],"answer":1,"explanation":"升降浮沉表示药物作用的趋向：向上、向下、向外、向内。","source":"《中药学》教材通行说法","topics":["zhongyao"],"difficulty":2,"status":"draft","reviewed_by":null,"reviewed_at":null},
{"id":"fangji-001","kind":"single","stem":"方剂里针对主病、起主要作用的药叫什么？","options":["佐药","臣药","君药","使药"],"answer":2,"explanation":"方剂的组成讲君、臣、佐、使：君药起主要作用，臣药辅助君药，佐药、使药起配合、调和的作用。","source":"《方剂学》教材通行说法","topics":["fangji"],"difficulty":1,"status":"draft","reviewed_by":null,"reviewed_at":null},
{"id":"fangji-002","kind":"single","stem":"下列哪一味不在四君子汤里？","options":["人参","白术","茯苓","当归"],"answer":3,"explanation":"四君子汤由人参、白术、茯苓、甘草组成。","source":"《太平惠民和剂局方》","topics":["fangji"],"difficulty":1,"status":"draft","reviewed_by":null,"reviewed_at":null},
{"id":"fangji-003","kind":"single","stem":"下列哪一味不在四物汤里？","options":["黄芪","当归","熟地黄","川芎"],"answer":0,"explanation":"四物汤由熟地黄、当归、白芍、川芎组成。","source":"《方剂学》教材通行说法","topics":["fangji"],"difficulty":1,"status":"draft","reviewed_by":null,"reviewed_at":null},
{"id":"fangji-004","kind":"single","stem":"麻黄汤出自哪部书？","options":["《温病条辨》","《伤寒论》","《本草纲目》","《小儿药证直诀》"],"answer":1,"explanation":"麻黄汤是东汉张仲景《伤寒论》里的方子。","source":"《伤寒论》","topics":["fangji","jingdian"],"difficulty":1,"status":"draft","reviewed_by":null,"reviewed_at":null},
{"id":"fangji-005","kind":"single","stem":"桂枝汤的组成里没有下面哪一味？","options":["桂枝","芍药","麻黄","大枣"],"answer":2,"explanation":"桂枝汤由桂枝、芍药、甘草、生姜、大枣组成。","source":"《伤寒论》","topics":["fangji"],"difficulty":2,"status":"draft","reviewed_by":null,"reviewed_at":null},
{"id":"fangji-006","kind":"single","stem":"六味地黄丸最早出自宋代钱乙的哪部书？","options":["《景岳全书》","《太平惠民和剂局方》","《伤寒论》","《小儿药证直诀》"],"answer":3,"explanation":"六味地黄丸原名「地黄丸」，见于钱乙的《小儿药证直诀》。","source":"《小儿药证直诀》","topics":["fangji","jingdian"],"difficulty":2,"status":"draft","reviewed_by":null,"reviewed_at":null},
{"id":"fangji-007","kind":"single","stem":"被后世称为「方书之祖」的是哪部书？","options":["《伤寒杂病论》","《黄帝内经》","《本草纲目》","《千金要方》"],"answer":0,"explanation":"张仲景的《伤寒杂病论》理法方药俱全，后世尊为「方书之祖」。","source":"《方剂学》教材通行说法","topics":["fangji","jingdian"],"difficulty":2,"status":"draft","reviewed_by":null,"reviewed_at":null},
{"id":"fangji-008","kind":"single","stem":"补中益气汤是金元时期哪位医家创制的？","options":["张仲景","李东垣","朱丹溪","张子和"],"answer":1,"explanation":"补中益气汤是金元四大家之一李东垣（李杲）创制的。","source":"《方剂学》教材通行说法","topics":["fangji"],"difficulty":2,"status":"draft","reviewed_by":null,"reviewed_at":null},
{"id":"fangji-009","kind":"single","stem":"银翘散出自哪部书？","options":["《伤寒论》","《千金要方》","《温病条辨》","《脾胃论》"],"answer":2,"explanation":"银翘散出自清代吴鞠通的《温病条辨》。","source":"《温病条辨》","topics":["fangji","jingdian"],"difficulty":2,"status":"draft","reviewed_by":null,"reviewed_at":null},
{"id":"fangji-010","kind":"single","stem":"玉屏风散由哪三味药组成？","options":["麻黄、桂枝、杏仁","人参、白术、茯苓","当归、川芎、白芍","黄芪、白术、防风"],"answer":3,"explanation":"玉屏风散由黄芪、白术、防风组成。","source":"《方剂学》教材通行说法","topics":["fangji"],"difficulty":1,"status":"draft","reviewed_by":null,"reviewed_at":null},
{"id":"fangji-011","kind":"single","stem":"「汗、吐、下、和、温、清、消、补」合称什么？","options":["八法","八纲","八脉","八卦"],"answer":0,"explanation":"清代程钟龄在《医学心悟》里把治法归纳为「八法」；「八纲」是阴阳、表里、寒热、虚实。","source":"《医学心悟》","topics":["fangji"],"difficulty":2,"status":"draft","reviewed_by":null,"reviewed_at":null},
{"id":"fangji-012","kind":"single","stem":"「汤者荡也，丸者缓也」说的是方剂哪方面的知识？","options":["药材的产地","剂型的特点","煎药的火候","药材的采收"],"answer":1,"explanation":"古人用这句话说明不同剂型的特点：汤剂作用快而强，丸剂作用慢而持久。","source":"《方剂学》教材通行说法","topics":["fangji"],"difficulty":2,"status":"draft","reviewed_by":null,"reviewed_at":null},
{"id":"jingdian-001","kind":"single","stem":"《黄帝内经》由哪两部分组成？","options":["《难经》和《脉经》","《伤寒论》和《金匮要略》","《素问》和《灵枢》","《千金要方》和《千金翼方》"],"answer":2,"explanation":"《黄帝内经》包括《素问》和《灵枢》，是现存最早的中医理论经典。","source":"中医基础理论教材通行说法","topics":["jingdian"],"difficulty":1,"status":"draft","reviewed_by":null,"reviewed_at":null},
{"id":"jingdian-002","kind":"single","stem":"《伤寒杂病论》的作者是谁？","options":["华佗","李时珍","孙思邈","张仲景"],"answer":3,"explanation":"《伤寒杂病论》是东汉张仲景所著。","source":"中医基础理论教材通行说法","topics":["jingdian"],"difficulty":1,"status":"draft","reviewed_by":null,"reviewed_at":null},
{"id":"jingdian-003","kind":"single","stem":"《本草纲目》的作者是谁？","options":["李时珍","张景岳","孙思邈","吴鞠通"],"answer":0,"explanation":"《本草纲目》是明代李时珍所著。","source":"中医基础理论教材通行说法","topics":["jingdian","zhongyao"],"difficulty":1,"status":"draft","reviewed_by":null,"reviewed_at":null},
{"id":"jingdian-004","kind":"single","stem":"《神农本草经》收载药物多少种？","options":["365 种","1892 种","844 种","100 种"],"answer":0,"explanation":"《神农本草经》收药 365 种，分上、中、下三品，是现存最早的本草专著。","source":"中医基础理论教材通行说法","topics":["jingdian","zhongyao"],"difficulty":2,"status":"draft","reviewed_by":null,"reviewed_at":null},
{"id":"jingdian-005","kind":"single","stem":"《本草纲目》成书于哪个朝代？","options":["唐代","宋代","明代","清代"],"answer":2,"explanation":"《本草纲目》成书于明代万历年间。","source":"中医基础理论教材通行说法","topics":["jingdian"],"difficulty":1,"status":"draft","reviewed_by":null,"reviewed_at":null},
{"id":"jingdian-006","kind":"single","stem":"《伤寒杂病论》经后世整理，分成了哪两部书？","options":["《素问》和《灵枢》","《伤寒论》和《金匮要略》","《难经》和《脉经》","《千金要方》和《千金翼方》"],"answer":1,"explanation":"《伤寒杂病论》原书散佚，后世整理成《伤寒论》和《金匮要略》两部。","source":"中医基础理论教材通行说法","topics":["jingdian"],"difficulty":2,"status":"draft","reviewed_by":null,"reviewed_at":null},
{"id":"jingdian-007","kind":"single","stem":"《千金要方》的作者是谁？","options":["皇甫谧","王叔和","孙思邈","钱乙"],"answer":2,"explanation":"《千金要方》（《备急千金要方》）是唐代孙思邈所著。","source":"中医基础理论教材通行说法","topics":["jingdian"],"difficulty":1,"status":"draft","reviewed_by":null,"reviewed_at":null},
{"id":"jingdian-008","kind":"single","stem":"《温病条辨》的作者是谁？","options":["叶天士","薛生白","王孟英","吴鞠通"],"answer":3,"explanation":"《温病条辨》是清代吴鞠通（吴瑭）所著。","source":"中医基础理论教材通行说法","topics":["jingdian"],"difficulty":2,"status":"draft","reviewed_by":null,"reviewed_at":null},
{"id":"jingdian-009","kind":"single","stem":"唐代由政府组织编修、被认为是世界上最早的国家药典的是？","options":["《新修本草》","《神农本草经》","《本草纲目》","《证类本草》"],"answer":0,"explanation":"《新修本草》（又称《唐本草》）由唐朝政府组织编修颁行。","source":"中医基础理论教材通行说法","topics":["jingdian","zhongyao"],"difficulty":2,"status":"draft","reviewed_by":null,"reviewed_at":null},
{"id":"jingdian-010","kind":"single","stem":"现存最早的脉学专著《脉经》的作者是谁？","options":["张仲景","王叔和","华佗","李时珍"],"answer":1,"explanation":"《脉经》是西晋王叔和所著。","source":"中医基础理论教材通行说法","topics":["jingdian","sizhen"],"difficulty":2,"status":"draft","reviewed_by":null,"reviewed_at":null},
{"id":"jingdian-011","kind":"single","stem":"现存最早的针灸学专著《针灸甲乙经》的作者是谁？","options":["杨继洲","王惟一","皇甫谧","华佗"],"answer":2,"explanation":"《针灸甲乙经》是西晋皇甫谧所著。","source":"中医基础理论教材通行说法","topics":["jingdian","jingluo"],"difficulty":2,"status":"draft","reviewed_by":null,"reviewed_at":null},
{"id":"jingdian-012","kind":"single","stem":"被后世尊称为「医圣」的是谁？","options":["孙思邈","李时珍","华佗","张仲景"],"answer":3,"explanation":"张仲景被尊为「医圣」，孙思邈被尊为「药王」。","source":"中医基础理论教材通行说法","topics":["jingdian"],"difficulty":1,"status":"draft","reviewed_by":null,"reviewed_at":null},
{"id":"jingdian-013","kind":"single","stem":"被后世尊称为「药王」的是谁？","options":["孙思邈","张仲景","王叔和","葛洪"],"answer":0,"explanation":"唐代孙思邈被尊为「药王」。","source":"中医基础理论教材通行说法","topics":["jingdian"],"difficulty":1,"status":"draft","reviewed_by":null,"reviewed_at":null},
{"id":"yangsheng-001","kind":"single","stem":"「圣人不治已病治未病」出自《素问》的哪一篇？","options":["上古天真论","四气调神大论","阴阳应象大论","灵兰秘典论"],"answer":1,"explanation":"这句话强调预防：在疾病发生之前就注意调养。","source":"《黄帝内经·素问·四气调神大论》","topics":["yangsheng","jingdian"],"difficulty":2,"status":"draft","reviewed_by":null,"reviewed_at":null},
{"id":"yangsheng-002","kind":"single","stem":"「春夏养阳，秋冬养阴」出自《素问》的哪一篇？","options":["上古天真论","金匮真言论","四气调神大论","宣明五气"],"answer":2,"explanation":"这句话讲顺应四时阴阳的变化来调养身体。","source":"《黄帝内经·素问·四气调神大论》","topics":["yangsheng","jingdian","yinyang"],"difficulty":2,"status":"draft","reviewed_by":null,"reviewed_at":null},
{"id":"yangsheng-003","kind":"single","stem":"「食饮有节，起居有常，不妄作劳」出自哪里？","options":["《千金要方》","《伤寒论》","《本草纲目》","《素问·上古天真论》"],"answer":3,"explanation":"这句话讲饮食有节制、作息有规律、不过度劳累。","source":"《黄帝内经·素问·上古天真论》","topics":["yangsheng","jingdian"],"difficulty":1,"status":"draft","reviewed_by":null,"reviewed_at":null},
{"id":"yangsheng-004","kind":"single","stem":"按《素问·四气调神大论》，春三月的起居是？","options":["夜卧早起","早卧早起","早卧晚起","夜卧晚起"],"answer":0,"explanation":"书中说春三月「夜卧早起，广步于庭」，冬三月「早卧晚起，必待日光」。","source":"《黄帝内经·素问·四气调神大论》","topics":["yangsheng"],"difficulty":2,"status":"draft","reviewed_by":null,"reviewed_at":null},
{"id":"yangsheng-005","kind":"single","stem":"按《素问·四气调神大论》，冬三月的起居是？","options":["夜卧早起","早卧晚起","早卧早起","夜卧晚起"],"answer":1,"explanation":"书中说冬三月「早卧晚起，必待日光」，顺应冬天闭藏的特点。","source":"《黄帝内经·素问·四气调神大论》","topics":["yangsheng"],"difficulty":2,"status":"draft","reviewed_by":null,"reviewed_at":null},
{"id":"yangsheng-006","kind":"single","stem":"「八段锦」是什么？","options":["一种脉象","一首方剂","传统导引健身功法","一部医书"],"answer":2,"explanation":"八段锦是由八节动作组成的传统导引健身功法。","source":"中医养生学通行说法","topics":["yangsheng"],"difficulty":1,"status":"draft","reviewed_by":null,"reviewed_at":null},
{"id":"yangsheng-007","kind":"single","stem":"「五禽戏」相传是哪位医家创编的？","options":["李时珍","张仲景","孙思邈","华佗"],"answer":3,"explanation":"五禽戏模仿虎、鹿、熊、猿、鸟五种动物的动作，相传是东汉华佗创编的。","source":"中医养生学通行说法","topics":["yangsheng"],"difficulty":1,"status":"draft","reviewed_by":null,"reviewed_at":null},
{"id":"yangsheng-008","kind":"single","stem":"《素问·宣明五气》讲「五劳所伤」，其中「久视」伤什么？","options":["血","气","肉","骨"],"answer":0,"explanation":"书中说久视伤血，久卧伤气，久坐伤肉，久立伤骨，久行伤筋。","source":"《黄帝内经·素问·宣明五气》","topics":["yangsheng","jingdian"],"difficulty":2,"status":"draft","reviewed_by":null,"reviewed_at":null},
{"id":"yangsheng-009","kind":"single","stem":"「恬惔虚无，真气从之，精神内守，病安从来」主要强调养生要注意什么？","options":["节制饮食","调摄精神","适当运动","避开寒邪"],"answer":1,"explanation":"这句话强调心境安闲、精神内守，是精神调摄的养生思想。","source":"《黄帝内经·素问·上古天真论》","topics":["yangsheng"],"difficulty":2,"status":"draft","reviewed_by":null,"reviewed_at":null},
{"id":"yangsheng-010","kind":"judge","stem":"判断：「治未病」的意思包括在疾病发生之前就注意预防。","options":["对","错"],"answer":0,"explanation":"治未病包括未病先防、既病防变，体现中医重视预防的思想。","source":"中医养生学通行说法","topics":["yangsheng"],"difficulty":1,"status":"draft","reviewed_by":null,"reviewed_at":null},
{"id":"yangsheng-011","kind":"single","stem":"「法于阴阳，和于术数」出自《素问》的哪一篇？","options":["生气通天论","四气调神大论","上古天真论","阴阳应象大论"],"answer":2,"explanation":"这句话说养生要效法自然界阴阳变化的规律，并掌握适当的养生方法。","source":"《黄帝内经·素问·上古天真论》","topics":["yangsheng","jingdian"],"difficulty":2,"status":"draft","reviewed_by":null,"reviewed_at":null}
]$quiz$::jsonb) as q(
  id text, kind text, stem text, options text[], answer smallint, explanation text, source text,
  topics text[], difficulty smallint, status text, reviewed_by text, reviewed_at date)
on conflict (id) do update set kind = excluded.kind, stem = excluded.stem, options = excluded.options, answer = excluded.answer, explanation = excluded.explanation, source = excluded.source, topics = excluded.topics, difficulty = excluded.difficulty, status = excluded.status, reviewed_by = excluded.reviewed_by, reviewed_at = excluded.reviewed_at, updated_at = now()
where (quiz_questions.kind, quiz_questions.stem, quiz_questions.options, quiz_questions.answer, quiz_questions.explanation, quiz_questions.source, quiz_questions.topics, quiz_questions.difficulty, quiz_questions.status, quiz_questions.reviewed_by, quiz_questions.reviewed_at)
  is distinct from (excluded.kind, excluded.stem, excluded.options, excluded.answer, excluded.explanation, excluded.source, excluded.topics, excluded.difficulty, excluded.status, excluded.reviewed_by, excluded.reviewed_at);
-- <<< 题库
