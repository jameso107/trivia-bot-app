-- ============================================================================
-- M6: org integration + ads scaffolding (PRD §7/§9).
--  * Venue health: a trigger keeps venues.last_night / nights_run /
--    first_night current when games end — the fields venue-success sweeps.
--  * Ads: pick_creative serves the right active creative per surface
--    (venue_promo > sponsor > house) and log_ad_impression emits the frozen
--    ad_impression event. Config-driven only — no ad network (PRD §2).
--  * Two house creatives seed the slots so they render from day one.
-- ============================================================================

create or replace function public.on_game_ended()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.state = 'ended' and old.state is distinct from new.state then
    update venues
       set last_night  = current_date,
           nights_run  = nights_run + 1,
           first_night = coalesce(first_night, current_date)
     where id = new.venue_id;
  end if;
  return new;
end;
$$;

create trigger games_ended_venue_health
  after update of state on games
  for each row
  execute function public.on_game_ended();

-- Which creative fills a surface for this game: the venue's own promo wins,
-- then sponsors, then house. Random among peers so rotations feel alive.
create or replace function public.pick_creative(p_game_id uuid, p_surface text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select to_jsonb(c)
  from ad_creatives c
  where c.active
    and c.surface = p_surface
    and (
      c.kind = 'house'
      or c.kind = 'sponsor'
      or (c.kind = 'venue_promo'
          and c.venue_id = (select venue_id from games where id = p_game_id))
    )
  order by case c.kind when 'venue_promo' then 0 when 'sponsor' then 1 else 2 end,
           random()
  limit 1;
$$;
grant execute on function public.pick_creative(uuid, text) to anon, authenticated;

create or replace function public.log_ad_impression(
  p_creative_id uuid,
  p_surface text,
  p_game_id uuid
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_venue uuid;
begin
  if p_surface not in ('screen','phone') then
    raise exception 'invalid surface';
  end if;
  if not exists (select 1 from ad_creatives where id = p_creative_id and active) then
    raise exception 'unknown creative';
  end if;
  select venue_id into v_venue from games where id = p_game_id;

  insert into analytics_events (event, game_id, venue_id, props)
  values ('ad_impression', p_game_id, v_venue,
          jsonb_build_object('creative_id', p_creative_id, 'surface', p_surface));
end;
$$;
grant execute on function public.log_ad_impression(uuid, text, uuid) to anon, authenticated;

-- Atomic once-per-player emit for the save prompt: concurrent stat fetches
-- (double-mounted effects, two devices) must not double-count the funnel.
-- Advisory xact lock serializes per player; service-role only (edge fn calls).
create or replace function public.emit_account_save_prompted(
  p_game_id uuid,
  p_venue_id uuid,
  p_team_id uuid,
  p_player_id uuid
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform pg_advisory_xact_lock(hashtextextended('save_prompted:' || p_player_id::text, 0));
  if not exists (
    select 1 from analytics_events
     where event = 'account_save_prompted'
       and game_id = p_game_id
       and player_id = p_player_id
  ) then
    insert into analytics_events (event, game_id, venue_id, team_id, player_id)
    values ('account_save_prompted', p_game_id, p_venue_id, p_team_id, p_player_id);
  end if;
end;
$$;
revoke execute on function public.emit_account_save_prompted(uuid, uuid, uuid, uuid)
  from public, anon, authenticated;

-- House creatives: the product advertising itself (v1 per PRD §7).
insert into ad_creatives (kind, surface, headline, body, cta_url) values
  ('house', 'screen', 'Love this? It''s free for bars.',
   'Trivia Bot runs the whole night — QR joins, auto-host, zero cost to the venue.',
   'https://trivia-bot-app.vercel.app'),
  ('house', 'phone', 'Bring Trivia Bot to your bar',
   'Free, self-running trivia nights. Tell your bartender.',
   'https://trivia-bot-app.vercel.app');
