-- =============================================================================
-- 本罐照片（LBL-8）：用户自己拍的药罐 / 药材照片，只在自己的药柜里用。设计见 docs/design/0010 §3.5
--
-- - pantry_settings 加 photo_path（可以空）：私有 bucket jar-photos 里的路径 <药柜 id>/<药材 id>/<uuid>.webp（Safari 不能在浏览器里转 WebP，用 .jpg）
-- - 路径必须属于这一行的药柜和药材（约束），文件的读写只放行药柜成员（storage 策略，用 can_access_jar_photo）
-- 只加可以为空的列、新函数和新 bucket，旧代码不受影响（旧代码 upsert pantry_settings 时不带这一列，不会被清掉）。
-- =============================================================================

alter table public.pantry_settings add column photo_path text;
alter table public.pantry_settings add constraint ps_photo_path check (
  photo_path is null or (
    photo_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}\.(webp|jpg)$'
    and split_part(photo_path, '/', 1) = workspace_id::text
    and split_part(photo_path, '/', 2) = herb_id::text
  )
);

-- storage 策略用：对象路径的第一段是当前用户所在的药柜。路径格式不对一律不放行（不会因为 uuid 转换报错）
create or replace function public.can_access_jar_photo(object_name text)
returns boolean
language sql stable security invoker set search_path = public, pg_temp
as $$
  -- case 保证先检查格式再转 uuid（and 不保证求值顺序）
  select case
    when object_name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f-]{36}/[0-9a-f-]{36}\.(webp|jpg)$'
      then public.is_member(split_part(object_name, '/', 1)::uuid)
    else false
  end;
$$;

do $$
begin
  revoke execute on function public.can_access_jar_photo(text) from public;
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke execute on function public.can_access_jar_photo(text) from anon;
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    grant execute on function public.can_access_jar_photo(text) to authenticated;
  end if;
end $$;

-- 私有 bucket + 策略（本地纯 Postgres 测试时没有 storage schema，跳过）。只收 WebP / JPEG、最大 1MB（App 在浏览器里先缩小、重新编码，去掉 EXIF 里的位置等信息）
do $$
begin
  if exists (select 1 from information_schema.schemata where schema_name = 'storage') then
    insert into storage.buckets (id, name, public) values ('jar-photos', 'jar-photos', false)
    on conflict (id) do nothing;
    if exists (select 1 from information_schema.columns
               where table_schema = 'storage' and table_name = 'buckets' and column_name = 'allowed_mime_types') then
      update storage.buckets set file_size_limit = 1048576, allowed_mime_types = array['image/webp', 'image/jpeg'] where id = 'jar-photos';
    end if;
    execute $p$
      create policy jar_photos_rw on storage.objects for all to authenticated
      using (bucket_id = 'jar-photos' and public.can_access_jar_photo(name))
      with check (bucket_id = 'jar-photos' and public.can_access_jar_photo(name))
    $p$;
  end if;
end $$;
