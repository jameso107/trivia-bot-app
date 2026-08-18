-- ============================================================================
-- M2: create_game — the venue dashboard's "start a night" path. Runs as a
-- SECURITY DEFINER RPC so the app stays on anon+RLS (CLAUDE.md): the function
-- itself validates membership, enforces the live-pack hard rule at creation,
-- allocates a collision-safe join code, and emits the frozen game_created
-- analytics event.
-- ============================================================================

create or replace function public.create_game(
  p_pack_id uuid,
  p_settings jsonb default '{}'::jsonb
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_venue uuid;
  v_game uuid;
  v_code text;
  v_alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; -- no 0/O/1/I (PRD §4)
begin
  select venue_id into v_venue
    from venue_members
   where user_id = (select auth.uid())
   limit 1;
  if v_venue is null then
    raise exception 'not a venue member';
  end if;

  if not exists (select 1 from packs where id = p_pack_id and status = 'live') then
    raise exception 'pack is not live';
  end if;

  for attempt in 1..8 loop
    v_code := '';
    for i in 1..4 loop
      v_code := v_code || substr(v_alphabet, 1 + floor(random() * 32)::int, 1);
    end loop;
    begin
      insert into games (venue_id, pack_id, join_code, settings)
      values (v_venue, p_pack_id, v_code, coalesce(p_settings, '{}'::jsonb))
      returning id into v_game;
      exit;
    exception when unique_violation then
      -- join-code collision — roll the dice again
    end;
  end loop;
  if v_game is null then
    raise exception 'could not allocate a join code';
  end if;

  insert into analytics_events (event, game_id, venue_id, props)
  values ('game_created', v_game, v_venue, jsonb_build_object('pack_id', p_pack_id));

  return v_game;
end;
$$;

revoke execute on function public.create_game(uuid, jsonb) from public, anon;
grant execute on function public.create_game(uuid, jsonb) to authenticated;
