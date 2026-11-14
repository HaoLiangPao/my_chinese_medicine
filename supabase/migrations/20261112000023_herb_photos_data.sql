-- =============================================================================
-- 药材默认照片的元数据（8 味）。由 scripts/fetch-herb-photos.mjs migration 生成，不要手改。
-- 来源：supabase/data/herb-photos.json（只取已核对、有照片的）。图片在 web/public/herb-photos/。
-- 设计：docs/design/0010-herb-labels.md §3.5。按药名对应（线上、本地的 herbs.id 不一样）；
-- 已经有的照片会被这里的覆盖（换图时重新生成一个 migration）。目录里没有的药跳过。
-- =============================================================================

insert into public.herb_photos (herb_id, file, kind, author, license, license_url, source_url, width, height, reviewed_by, reviewed_at)
select h.id, v.file, v.kind, v.author, v.license, v.license_url, v.source_url, v.width::int, v.height::int, v.reviewed_by, v.reviewed_at::date
from (values
  ('麻黄', 'ma-huang.webp', '饮片', 'Hanabishi', 'CC BY-SA 3.0', 'https://creativecommons.org/licenses/by-sa/3.0', 'https://commons.wikimedia.org/wiki/File:Maou.jpg', '479', '800', 'Hao', '2026-11-12'),
  ('紫苏叶', 'zi-su-ye.webp', '植物', 'Famartin', 'CC BY-SA 4.0', 'https://creativecommons.org/licenses/by-sa/4.0', 'https://commons.wikimedia.org/wiki/File:2023-08-11_15_12_45_Purple_shiso_along_Lochatong_Road_in_the_Mountainvifew_section_of_Ewing_Township,_Mercer_County,_New_Jersey.jpg', '800', '600', 'Hao', '2026-11-12'),
  ('生姜', 'sheng-jiang.webp', '饮片', 'BogTar201213', 'CC BY-SA 4.0', 'https://creativecommons.org/licenses/by-sa/4.0', 'https://commons.wikimedia.org/wiki/File:Ginger_root.jpg', '800', '454', 'Hao', '2026-11-12'),
  ('白芷', 'bai-zhi.webp', '饮片', 'Fumikas Sagisavas', 'CC0', 'http://creativecommons.org/publicdomain/zero/1.0/deed.en', 'https://commons.wikimedia.org/wiki/File:Dried_angelica_dahurica_slices.jpg', '800', '800', 'Hao', '2026-11-12'),
  ('菊花', 'ju-hua.webp', '饮片', 'Fumikas Sagisavas', 'CC0', 'http://creativecommons.org/publicdomain/zero/1.0/deed.en', 'https://commons.wikimedia.org/wiki/File:Chrysanthemum_tea_(20240131).jpg', '640', '640', 'Hao', '2026-11-12'),
  ('葛根', 'ge-gen.webp', '植物', '측천문후', 'CC BY 4.0', 'https://creativecommons.org/licenses/by/4.0', 'https://commons.wikimedia.org/wiki/File:Chik_2.jpg', '700', '465', 'Hao', '2026-11-12'),
  ('金银花', 'jin-yin-hua.webp', '饮片', 'François Nguyen', 'CC BY 2.0', 'https://creativecommons.org/licenses/by/2.0', 'https://commons.wikimedia.org/wiki/File:Dried_honeysuckle.jpg', '800', '800', 'Hao', '2026-11-12'),
  ('大黄', 'da-huang.webp', '饮片', 'Maša Sinreih in Valentina Vivod', 'CC BY-SA 3.0', 'https://creativecommons.org/licenses/by-sa/3.0', 'https://commons.wikimedia.org/wiki/File:Rhei1.JPG', '800', '600', 'Hao', '2026-11-12')
) as v(name_zh, file, kind, author, license, license_url, source_url, width, height, reviewed_by, reviewed_at)
join public.herbs h on h.name_zh = v.name_zh
on conflict (herb_id) do update set
  file = excluded.file, kind = excluded.kind, author = excluded.author, license = excluded.license,
  license_url = excluded.license_url, source_url = excluded.source_url, width = excluded.width, height = excluded.height,
  reviewed_by = excluded.reviewed_by, reviewed_at = excluded.reviewed_at;
