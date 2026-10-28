-- 常用药材种子数据（可反复执行）。分类按《中药学》教材的功效分类。
-- 不全也没关系：录药方时遇到新药材可以直接在 App 里新增。

insert into public.herbs (name_zh, pinyin, category) values
  -- 解表药
  ('麻黄', 'ma huang', '解表药'),
  ('桂枝', 'gui zhi', '解表药'),
  ('紫苏叶', 'zi su ye', '解表药'),
  ('生姜', 'sheng jiang', '解表药'),
  ('荆芥', 'jing jie', '解表药'),
  ('防风', 'fang feng', '解表药'),
  ('白芷', 'bai zhi', '解表药'),
  ('薄荷', 'bo he', '解表药'),
  ('桑叶', 'sang ye', '解表药'),
  ('菊花', 'ju hua', '解表药'),
  ('葛根', 'ge gen', '解表药'),
  ('柴胡', 'chai hu', '解表药'),
  ('升麻', 'sheng ma', '解表药'),
  -- 清热药
  ('石膏', 'shi gao', '清热药'),
  ('知母', 'zhi mu', '清热药'),
  ('栀子', 'zhi zi', '清热药'),
  ('黄芩', 'huang qin', '清热药'),
  ('黄连', 'huang lian', '清热药'),
  ('黄柏', 'huang bai', '清热药'),
  ('金银花', 'jin yin hua', '清热药'),
  ('连翘', 'lian qiao', '清热药'),
  ('蒲公英', 'pu gong ying', '清热药'),
  ('生地黄', 'sheng di huang', '清热药'),
  ('玄参', 'xuan shen', '清热药'),
  ('牡丹皮', 'mu dan pi', '清热药'),
  ('赤芍', 'chi shao', '清热药'),
  -- 泻下 / 祛湿 / 利水
  ('大黄', 'da huang', '泻下药'),
  ('独活', 'du huo', '祛风湿药'),
  ('羌活', 'qiang huo', '解表药'),
  ('藿香', 'huo xiang', '化湿药'),
  ('苍术', 'cang zhu', '化湿药'),
  ('厚朴', 'hou po', '化湿药'),
  ('砂仁', 'sha ren', '化湿药'),
  ('茯苓', 'fu ling', '利水渗湿药'),
  ('猪苓', 'zhu ling', '利水渗湿药'),
  ('泽泻', 'ze xie', '利水渗湿药'),
  ('薏苡仁', 'yi yi ren', '利水渗湿药'),
  ('车前子', 'che qian zi', '利水渗湿药'),
  -- 温里 / 理气 / 消食
  ('干姜', 'gan jiang', '温里药'),
  ('肉桂', 'rou gui', '温里药'),
  ('陈皮', 'chen pi', '理气药'),
  ('枳壳', 'zhi ke', '理气药'),
  ('枳实', 'zhi shi', '理气药'),
  ('木香', 'mu xiang', '理气药'),
  ('香附', 'xiang fu', '理气药'),
  ('佛手', 'fo shou', '理气药'),
  ('山楂', 'shan zha', '消食药'),
  ('神曲', 'shen qu', '消食药'),
  ('麦芽', 'mai ya', '消食药'),
  ('鸡内金', 'ji nei jin', '消食药'),
  -- 活血 / 止血 / 化痰止咳
  ('川芎', 'chuan xiong', '活血化瘀药'),
  ('丹参', 'dan shen', '活血化瘀药'),
  ('桃仁', 'tao ren', '活血化瘀药'),
  ('红花', 'hong hua', '活血化瘀药'),
  ('牛膝', 'niu xi', '活血化瘀药'),
  ('益母草', 'yi mu cao', '活血化瘀药'),
  ('三七', 'san qi', '止血药'),
  ('半夏', 'ban xia', '化痰止咳平喘药'),
  ('桔梗', 'jie geng', '化痰止咳平喘药'),
  ('川贝母', 'chuan bei mu', '化痰止咳平喘药'),
  ('浙贝母', 'zhe bei mu', '化痰止咳平喘药'),
  ('苦杏仁', 'ku xing ren', '化痰止咳平喘药'),
  -- 安神 / 平肝
  ('酸枣仁', 'suan zao ren', '安神药'),
  ('远志', 'yuan zhi', '安神药'),
  ('龙骨', 'long gu', '安神药'),
  ('牡蛎', 'mu li', '平肝息风药'),
  ('天麻', 'tian ma', '平肝息风药'),
  ('钩藤', 'gou teng', '平肝息风药'),
  -- 补虚药
  ('人参', 'ren shen', '补气药'),
  ('西洋参', 'xi yang shen', '补气药'),
  ('党参', 'dang shen', '补气药'),
  ('太子参', 'tai zi shen', '补气药'),
  ('黄芪', 'huang qi', '补气药'),
  ('白术', 'bai zhu', '补气药'),
  ('山药', 'shan yao', '补气药'),
  ('甘草', 'gan cao', '补气药'),
  ('大枣', 'da zao', '补气药'),
  ('当归', 'dang gui', '补血药'),
  ('熟地黄', 'shu di huang', '补血药'),
  ('白芍', 'bai shao', '补血药'),
  ('阿胶', 'e jiao', '补血药'),
  ('何首乌', 'he shou wu', '补血药'),
  ('龙眼肉', 'long yan rou', '补血药'),
  ('麦冬', 'mai dong', '补阴药'),
  ('天冬', 'tian dong', '补阴药'),
  ('沙参', 'sha shen', '补阴药'),
  ('玉竹', 'yu zhu', '补阴药'),
  ('百合', 'bai he', '补阴药'),
  ('石斛', 'shi hu', '补阴药'),
  ('枸杞子', 'gou qi zi', '补阴药'),
  ('女贞子', 'nv zhen zi', '补阴药'),
  ('杜仲', 'du zhong', '补阳药'),
  ('续断', 'xu duan', '补阳药'),
  ('菟丝子', 'tu si zi', '补阳药'),
  ('淫羊藿', 'yin yang huo', '补阳药'),
  -- 收涩药
  ('五味子', 'wu wei zi', '收涩药'),
  ('山茱萸', 'shan zhu yu', '收涩药'),
  ('莲子', 'lian zi', '收涩药'),
  ('芡实', 'qian shi', '收涩药'),
  ('浮小麦', 'fu xiao mai', '收涩药')
on conflict (name_zh) do nothing;

-- 炮制品：单独一行，指回原药材
insert into public.herbs (name_zh, pinyin, category, base_herb_id)
select v.name_zh, v.pinyin, b.category, b.id
from (values
  ('炙黄芪', 'zhi huang qi', '黄芪'),
  ('炙甘草', 'zhi gan cao', '甘草'),
  ('炒白术', 'chao bai zhu', '白术'),
  ('法半夏', 'fa ban xia', '半夏'),
  ('姜半夏', 'jiang ban xia', '半夏'),
  ('炒酸枣仁', 'chao suan zao ren', '酸枣仁'),
  ('焦山楂', 'jiao shan zha', '山楂'),
  ('炒麦芽', 'chao mai ya', '麦芽'),
  ('炒薏苡仁', 'chao yi yi ren', '薏苡仁'),
  ('酒当归', 'jiu dang gui', '当归'),
  ('醋香附', 'cu xiang fu', '香附'),
  ('煅龙骨', 'duan long gu', '龙骨'),
  ('煅牡蛎', 'duan mu li', '牡蛎')
) as v(name_zh, pinyin, base)
join public.herbs b on b.name_zh = v.base
on conflict (name_zh) do nothing;

-- 别名 / 常见简写（药方手写体里很常见）
insert into public.herb_aliases (alias, herb_id)
select v.alias, h.id
from (values
  ('北芪', '黄芪'), ('黄耆', '黄芪'),
  ('麦门冬', '麦冬'),
  ('生地', '生地黄'), ('熟地', '熟地黄'),
  ('丹皮', '牡丹皮'),
  ('枣仁', '酸枣仁'), ('炒枣仁', '炒酸枣仁'),
  ('苡仁', '薏苡仁'), ('薏米', '薏苡仁'), ('生薏仁', '薏苡仁'),
  ('杏仁', '苦杏仁'),
  ('川贝', '川贝母'), ('浙贝', '浙贝母'),
  ('枸杞', '枸杞子'),
  ('怀山药', '山药'), ('淮山', '山药'),
  ('山萸肉', '山茱萸'), ('萸肉', '山茱萸'),
  ('苏叶', '紫苏叶'),
  ('银花', '金银花'),
  ('生甘草', '甘草'),
  ('生黄芪', '黄芪'),
  ('生白术', '白术'),
  ('桂圆肉', '龙眼肉'),
  ('怀牛膝', '牛膝')
) as v(alias, herb_name)
join public.herbs h on h.name_zh = v.herb_name
where v.alias <> v.herb_name
on conflict (alias) do nothing;
