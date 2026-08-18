-- ============================================================================
-- M1.1 review fixes (DB side).
--
-- 1) apply_reveal_scores — reveal scoring becomes ONE transactional call, and
--    an IDEMPOTENT one: team totals are recomputed absolutely from answers
--    rather than incremented, so a re-run (crash recovery, concurrent advance
--    race) converges on the same result instead of double-counting.
--
-- 2) sweep_abandoned_games — PRD §5 state-machine rule: games idle >4h are
--    auto-set to 'abandoned' (excluded from KPIs) and emit the frozen
--    `game_abandoned` analytics event. Scheduled hourly via pg_cron.
-- ============================================================================

create or replace function public.apply_reveal_scores(
  p_game_id uuid,
  p_question_id uuid,
  p_scores jsonb -- [{"team_id": "...", "is_correct": bool, "points": 123}, ...]
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  s jsonb;
begin
  for s in select * from jsonb_array_elements(p_scores) loop
    update answers
       set is_correct = (s->>'is_correct')::boolean,
           points     = (s->>'points')::numeric
     where game_id = p_game_id
       and question_id = p_question_id
       and team_id = (s->>'team_id')::uuid;
  end loop;

  -- Absolute recompute => idempotent reveals.
  update game_teams gt
     set score = coalesce((
       select sum(a.points) from answers a
        where a.game_id = p_game_id and a.team_id = gt.id and a.points is not null
     ), 0)
   where gt.game_id = p_game_id;
end;
$$;

revoke execute on function public.apply_reveal_scores(uuid, uuid, jsonb)
  from public, anon, authenticated;

create or replace function public.sweep_abandoned_games()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  n int;
begin
  with swept as (
    update games
       set state = 'abandoned', ended_at = now()
     where state not in ('ended','abandoned')
       and coalesce(question_started_at, started_at, created_at) < now() - interval '4 hours'
    returning id, venue_id
  ), emitted as (
    insert into analytics_events (event, game_id, venue_id)
    select 'game_abandoned', id, venue_id from swept
  )
  select count(*) into n from swept;
  return n;
end;
$$;

revoke execute on function public.sweep_abandoned_games()
  from public, anon, authenticated;

create extension if not exists pg_cron;
select cron.schedule('sweep-abandoned-games', '17 * * * *',
  'select public.sweep_abandoned_games()');
