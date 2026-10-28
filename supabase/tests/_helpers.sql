-- 每个测试文件开头 \ir _helpers.sql：授权 + 三个测试用户 + 断言函数
\set ON_ERROR_STOP on
-- 授权来自 auth_stub.sql 里的 default privileges（模拟 Supabase），这里不再整体 grant，
-- 否则会盖掉 migration 里的 revoke。

insert into auth.users values
  ('00000000-0000-0000-0000-00000000000a', 'hao@example.com'),
  ('00000000-0000-0000-0000-00000000000b', 'stranger@example.com'),
  ('00000000-0000-0000-0000-00000000000c', 'tina@example.com');

-- assert_eq(实际, 期望, 说明)：不相等就报错，错误信息里带上两个值
create or replace function public.assert_eq(actual anyelement, expected anyelement, label text)
returns void language plpgsql as $$
begin
  if actual is distinct from expected then
    raise exception 'FAIL: % — expected %, got %', label, expected, actual;
  end if;
end $$;

-- assert_raises(sql, 期望错误片段, 说明)
create or replace function public.assert_raises(stmt text, expected_fragment text, label text)
returns void language plpgsql as $$
begin
  begin
    execute stmt;
  exception when others then
    if position(expected_fragment in sqlerrm) = 0 then
      raise exception 'FAIL: % — expected error containing "%", got "%"', label, expected_fragment, sqlerrm;
    end if;
    return;
  end;
  raise exception 'FAIL: % — expected an error, but statement succeeded', label;
end $$;
grant execute on function public.assert_eq(anyelement, anyelement, text), public.assert_raises(text, text, text) to authenticated;

create or replace function public.stock(name text) returns numeric language sql stable as $$
  select coalesce((select on_hand_grams from public.v_inventory where name_zh = name), 0)
$$;
grant execute on function public.stock(text) to authenticated;

-- 切换身份
\set as_hao   'set role authenticated; set request.jwt.claim.sub = ''00000000-0000-0000-0000-00000000000a'''
\set as_other 'set role authenticated; set request.jwt.claim.sub = ''00000000-0000-0000-0000-00000000000b'''
\set as_tina  'set role authenticated; set request.jwt.claim.sub = ''00000000-0000-0000-0000-00000000000c'''
