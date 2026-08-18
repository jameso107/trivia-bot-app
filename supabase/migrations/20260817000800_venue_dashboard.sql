-- ============================================================================
-- M5: the venue dashboard grows up (PRD §7). Everything stateful is a
-- SECURITY DEFINER RPC so the app stays anon+RLS; each validates membership
-- (or player device keys) itself. The signup RPC is the org daemon's wake-up
-- call: it writes the §9 `events` row alongside the frozen analytics event.
-- ============================================================================

-- ---------- signup: first-run wizard ----------
create or replace function public.signup_venue(
  p_name text,
  p_metro text,
  p_slug text
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid;
  v_venue uuid;
begin
  v_user := (select auth.uid());
  if v_user is null then
    raise exception 'sign in required';
  end if;
  if p_name is null or length(trim(p_name)) not between 2 and 64 then
    raise exception 'venue name must be 2-64 characters';
  end if;
  if p_metro is null or length(trim(p_metro)) not between 2 and 40 then
    raise exception 'metro must be 2-40 characters';
  end if;
  if p_slug is null or p_slug !~ '^[a-z0-9][a-z0-9-]{1,30}[a-z0-9]$' then
    raise exception 'slug must be 3-32 chars: lowercase letters, digits, dashes';
  end if;
  if exists (select 1 from venues where slug = p_slug) then
    raise exception 'that link name is taken — pick another';
  end if;

  insert into venues (name, metro, slug)
  values (trim(p_name), trim(p_metro), p_slug)
  returning id into v_venue;

  insert into venue_members (venue_id, user_id, role)
  values (v_venue, v_user, 'owner');

  -- The org daemon's CX flow consumes this row (PRD §4/§9).
  insert into events (kind, payload)
  values ('venue_signup', jsonb_build_object(
    'venue_id', v_venue, 'name', trim(p_name), 'metro', trim(p_metro), 'slug', p_slug
  ));

  insert into analytics_events (event, venue_id)
  values ('venue_signup_completed', v_venue);

  return v_venue;
end;
$$;
revoke execute on function public.signup_venue(text, text, text) from public, anon;
grant execute on function public.signup_venue(text, text, text) to authenticated;

-- ---------- members may edit their venue's display fields + settings ----------
-- (slug stays immutable: it's printed on flyers.)
create policy "venues: members update" on venues
  for update using (public.is_venue_member(id));
grant update (name, metro, settings) on venues to authenticated;

-- ---------- custom pack requests (premium; v1 comped) ----------
create or replace function public.request_custom_pack(
  p_topic text,
  p_notes text default null,
  p_question_count int default 40
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := (select auth.uid());
  v_venue uuid;
  v_comped boolean;
  v_req uuid;
begin
  select venue_id into v_venue from venue_members where user_id = v_user limit 1;
  if v_venue is null then
    raise exception 'not a venue member';
  end if;
  if p_topic is null or length(trim(p_topic)) not between 3 and 120 then
    raise exception 'topic must be 3-120 characters';
  end if;
  -- PRD §7: v1 every venue is comped; the gate exists so the flow is real
  -- before billing does. settings.premium_comped=false turns it off.
  select coalesce((settings->>'premium_comped')::boolean, true)
    into v_comped from venues where id = v_venue;
  if not v_comped then
    raise exception 'custom packs are a premium feature for this venue';
  end if;

  insert into custom_pack_requests (venue_id, topic, notes, question_count)
  values (v_venue, trim(p_topic), nullif(trim(coalesce(p_notes, '')), ''),
          least(greatest(coalesce(p_question_count, 40), 10), 60))
  returning id into v_req;

  insert into analytics_events (event, venue_id, props)
  values ('custom_pack_requested', v_venue, jsonb_build_object('topic', trim(p_topic)));

  return v_req;
end;
$$;
revoke execute on function public.request_custom_pack(text, text, int) from public, anon;
grant execute on function public.request_custom_pack(text, text, int) to authenticated;

-- ---------- the promo QR target: a venue's current joinable game ----------
create or replace function public.venue_current_game(p_slug text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'venue_name', v.name,
    'join_code', (
      select g.join_code from games g
       where g.venue_id = v.id
         and g.state not in ('ended','abandoned')
         and g.created_at > now() - interval '12 hours'
       order by g.created_at desc
       limit 1
    )
  )
  from venues v
  where v.slug = p_slug;
$$;
grant execute on function public.venue_current_game(text) to anon, authenticated;

-- ---------- promo kit download beacon (frozen §8 event) ----------
create or replace function public.log_promo_kit_download()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_venue uuid;
begin
  select venue_id into v_venue
    from venue_members where user_id = (select auth.uid()) limit 1;
  if v_venue is null then
    raise exception 'not a venue member';
  end if;
  insert into analytics_events (event, venue_id) values ('promo_kit_downloaded', v_venue);
end;
$$;
revoke execute on function public.log_promo_kit_download() from public, anon;
grant execute on function public.log_promo_kit_download() to authenticated;

-- ---------- feedback: both surfaces (PRD §7/§9 — user-support's queue) ----------
create or replace function public.submit_feedback(
  p_source text,
  p_body text,
  p_game_id uuid default null,
  p_contact_email text default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_venue uuid;
  v_id uuid;
begin
  if p_source not in ('player','venue') then
    raise exception 'invalid source';
  end if;
  if p_body is null or length(trim(p_body)) not between 3 and 2000 then
    raise exception 'feedback must be 3-2000 characters';
  end if;
  if p_source = 'venue' then
    select venue_id into v_venue
      from venue_members where user_id = (select auth.uid()) limit 1;
    if v_venue is null then
      raise exception 'not a venue member';
    end if;
  elsif p_game_id is not null then
    select venue_id into v_venue from games where id = p_game_id;
  end if;

  insert into feedback (source, game_id, venue_id, body, contact_email)
  values (p_source, p_game_id, v_venue, trim(p_body),
          nullif(trim(coalesce(p_contact_email, '')), ''))
  returning id into v_id;

  insert into analytics_events (event, game_id, venue_id)
  values ('feedback_submitted', p_game_id, v_venue);

  return v_id;
end;
$$;
grant execute on function public.submit_feedback(text, text, uuid, text) to anon, authenticated;

-- ---------- the live challenge button (PRD §4/§9 — trivia-qa's queue) ----------
create or replace function public.file_dispute(
  p_game_id uuid,
  p_question_id uuid,
  p_player_id uuid,
  p_device_key text,
  p_claim text default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_team uuid;
  v_venue uuid;
  v_id uuid;
begin
  select gp.team_id, g.venue_id into v_team, v_venue
    from game_players gp
    join games g on g.id = gp.game_id
   where gp.id = p_player_id
     and gp.game_id = p_game_id
     and gp.device_key = p_device_key;
  if v_team is null then
    raise exception 'not a player in this game';
  end if;
  if not exists (
    select 1 from pack_questions q
      join games g on g.pack_id = q.pack_id
     where q.id = p_question_id and g.id = p_game_id
  ) then
    raise exception 'that question is not part of this game';
  end if;
  -- One dispute per team per question keeps trivia-qa's queue sane.
  if exists (
    select 1 from question_disputes
     where game_id = p_game_id and question_id = p_question_id and team_id = v_team
  ) then
    raise exception 'your team already challenged this one';
  end if;

  insert into question_disputes (game_id, question_id, team_id, claim)
  values (p_game_id, p_question_id, v_team,
          nullif(trim(coalesce(p_claim, '')), ''))
  returning id into v_id;

  insert into analytics_events (event, game_id, venue_id, team_id, player_id)
  values ('challenge_filed', p_game_id, v_venue, v_team, p_player_id);

  return v_id;
end;
$$;
grant execute on function public.file_dispute(uuid, uuid, uuid, text, text) to anon, authenticated;

-- ---------- per-night history for the dashboard ----------
create or replace function public.venue_history()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(night order by night->>'created_at' desc), '[]'::jsonb)
  from (
    select jsonb_build_object(
      'game_id', g.id,
      'created_at', g.created_at,
      'state', g.state,
      'pack_title', p.title,
      'join_code', g.join_code,
      'players', (select count(*) from game_players gp where gp.game_id = g.id),
      'teams', (select count(*) from game_teams gt where gt.game_id = g.id),
      'winner', (
        select gt.name from game_teams gt
         where gt.game_id = g.id
         order by gt.score desc, gt.name asc
         limit 1
      ),
      'duration_s', case
        when g.started_at is not null and g.ended_at is not null
        then extract(epoch from g.ended_at - g.started_at)::int
        else null
      end
    ) as night
    from games g
    join packs p on p.id = g.pack_id
    where g.venue_id = (
      select venue_id from venue_members where user_id = (select auth.uid()) limit 1
    )
  ) nights;
$$;
revoke execute on function public.venue_history() from public, anon;
grant execute on function public.venue_history() to authenticated;
