-- =============================================================================
-- 药材默认照片的元数据（全站一份）。设计见 docs/design/0010-herb-labels.md §3.5
--
-- - 图片文件在仓库的 web/public/herb-photos/<file>（随网站部署），这里只记文件名、出处和核对人
-- - 只放 Hao 核对过的照片：reviewed_by、reviewed_at 不能空
-- - 谁都能读（包括 anon，以后的公开介绍页用）；谁都不能写，只由 migration 写入
--   （内容由下一个 migration，scripts/fetch-herb-photos.mjs 生成）
-- 只加新表，旧代码不受影响。
-- =============================================================================

create table public.herb_photos (
  herb_id     uuid primary key references public.herbs(id) on delete cascade,
  file        text not null,
  kind        text not null,
  author      text,
  license     text not null,
  license_url text,
  source_url  text not null,
  width       integer,
  height      integer,
  reviewed_by text not null,
  reviewed_at date not null,

  -- 文件名只能是 <拼音>.webp，不能带路径
  constraint hp_file check (file ~ '^[a-z]+(-[a-z]+)*\.webp$'),
  constraint hp_kind check (kind in ('饮片', '药材', '植物')),
  -- 只用 Wikimedia Commons 上授权明确的图：公有领域 / CC0 / CC BY / CC BY-SA
  constraint hp_license check (license ~* '^(public domain|pd\M|cc0|cc by(-sa)? \d)'),
  constraint hp_source check (source_url like 'https://commons.wikimedia.org/%'),
  constraint hp_size check (width is null or (width between 1 and 4000 and height between 1 and 4000)),
  constraint hp_reviewer check (btrim(reviewed_by) <> '')
);

alter table public.herb_photos enable row level security;
create policy hp_read on public.herb_photos for select to anon, authenticated using (true);

do $$
declare r text;
begin
  foreach r in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('revoke insert, update, delete, truncate on public.herb_photos from %I', r);
      execute format('grant select on public.herb_photos to %I', r);
    end if;
  end loop;
end $$;
