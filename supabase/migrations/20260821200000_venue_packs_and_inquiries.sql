-- ============================================================================
-- Venue-authored packs ("make your own trivia") + website inquiries.
-- packs.venue_id and source='custom' existed since M0 — this wires them up:
--   * RLS: the global library is live+venue_id-null; venues additionally see
--     their OWN packs in any status (the old policy leaked every live pack,
--     including other venues' customs, to everyone).
--   * RPCs (SECURITY DEFINER, app stays anon+RLS): create/save/publish/retire
--     a venue pack. Publish sets a self-serve qa_report in the SAME update so
--     the pack_publish_guard trigger holds for org packs and passes here.
--   * create_game learns that a venue may start nights on its own live packs.
--   * submit_inquiry: the public website's inbound-lead form → org events row
--     (kind=website_inquiry), same wake-up channel as venue_signup (PRD §9's
--     events table is generic by design).
-- §9 note: no org-contract tables/statuses change here.
-- ============================================================================

-- ---- RLS: scope the library, reveal own packs ----
drop policy "packs: only live are visible" on packs;
create policy "packs: live library is public" on packs
  for select using (status = 'live' and venue_id is null);
create policy "packs: venue members see their own" on packs
  for select using (venue_id is not null and public.is_venue_member(venue_id));

-- The editor needs to read its own questions (they're the venue's OWN answers;
-- library questions stay server-only).
create policy "pack_questions: venue members read their own packs" on pack_questions
  for select using (
    exists (
      select 1 from packs p
      where p.id = pack_id and p.venue_id is not null and public.is_venue_member(p.venue_id)
    )
  );
grant select on pack_questions to authenticated;

-- ---- create a draft ----
create or replace function public.create_venue_pack(
  p_title text,
  p_topic text
) returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_venue uuid;
  v_pack uuid;
begin
  select venue_id into v_venue from venue_members where user_id = (select auth.uid()) limit 1;
  if v_venue is null then raise exception 'not a venue member'; end if;
  if length(trim(coalesce(p_title, ''))) < 3 then raise exception 'title too short'; end if;

  insert into packs (title, topic, question_count, rounds, source, venue_id, status, created_by)
  values (trim(p_title), coalesce(nullif(trim(p_topic), ''), 'house'), 0, 0, 'custom', v_venue, 'draft', 'venue')
  returning id into v_pack;
  return v_pack;
end;
$$;
revoke execute on function public.create_venue_pack(text, text) from public, anon;
grant execute on function public.create_venue_pack(text, text) to authenticated;

-- ---- save (replace-all) the draft's questions ----
-- p_questions: [{prompt, format: 'multiple_choice'|'true_false',
--                options?: [2..6 strings], answer: int index | boolean,
--                time_limit_s?: int, note?: text}, ...]
-- Layout is automatic: rounds of up to 10; when p_has_final, the LAST question
-- becomes the wager final at (rounds+1, 1) per the engine convention.
create or replace function public.save_venue_pack(
  p_pack_id uuid,
  p_title text,
  p_topic text,
  p_questions jsonb,
  p_has_final boolean default false
) returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_venue uuid;
  v_n int;
  v_regular int;
  v_rounds int;
  q jsonb;
  i int := 0;
  v_round int;
  v_pos int;
  v_format text;
  v_options jsonb;
  v_answer jsonb;
  v_time int;
begin
  select venue_id into v_venue from venue_members where user_id = (select auth.uid()) limit 1;
  if v_venue is null then raise exception 'not a venue member'; end if;
  if not exists (select 1 from packs where id = p_pack_id and venue_id = v_venue and status = 'draft') then
    raise exception 'pack is not one of your drafts';
  end if;
  if jsonb_typeof(p_questions) <> 'array' then raise exception 'questions must be an array'; end if;
  v_n := jsonb_array_length(p_questions);
  if v_n < 1 or v_n > 100 then raise exception 'between 1 and 100 questions'; end if;
  if p_has_final and v_n < 2 then raise exception 'a final needs at least one regular question before it'; end if;

  v_regular := case when p_has_final then v_n - 1 else v_n end;
  v_rounds := greatest(1, ceil(v_regular / 10.0)::int);

  delete from pack_questions where pack_id = p_pack_id;

  for q in select * from jsonb_array_elements(p_questions) loop
    i := i + 1;
    v_format := q->>'format';
    if v_format not in ('multiple_choice', 'true_false') then
      raise exception 'question %: format must be multiple_choice or true_false', i;
    end if;
    if length(trim(coalesce(q->>'prompt', ''))) < 5 then
      raise exception 'question %: prompt too short', i;
    end if;

    if v_format = 'multiple_choice' then
      v_options := q->'options';
      if jsonb_typeof(v_options) <> 'array'
         or jsonb_array_length(v_options) < 2 or jsonb_array_length(v_options) > 6 then
        raise exception 'question %: multiple choice needs 2-6 options', i;
      end if;
      if jsonb_typeof(q->'answer') <> 'number'
         or (q->>'answer')::int < 0 or (q->>'answer')::int >= jsonb_array_length(v_options) then
        raise exception 'question %: answer must be the index of the correct option', i;
      end if;
      v_answer := q->'answer';
    else
      v_options := null;
      if jsonb_typeof(q->'answer') <> 'boolean' then
        raise exception 'question %: true/false answer must be true or false', i;
      end if;
      v_answer := q->'answer';
    end if;

    v_time := coalesce((q->>'time_limit_s')::int, 25);
    if v_time not between 10 and 120 then raise exception 'question %: time limit 10-120s', i; end if;

    if p_has_final and i = v_n then
      v_round := v_rounds + 1;
      v_pos := 1;
    else
      v_round := ((i - 1) / 10) + 1;
      v_pos := ((i - 1) % 10) + 1;
    end if;

    insert into pack_questions
      (pack_id, round, position, format, prompt, options, answer, answer_note, difficulty, time_limit_s)
    values
      (p_pack_id, v_round, v_pos, v_format, trim(q->>'prompt'), v_options, v_answer,
       coalesce(nullif(trim(q->>'note'), ''), 'house question — written by the venue'),
       3.0, v_time);
  end loop;

  update packs
     set title = coalesce(nullif(trim(p_title), ''), title),
         topic = coalesce(nullif(trim(p_topic), ''), topic),
         question_count = v_n,
         rounds = v_rounds
   where id = p_pack_id;
end;
$$;
revoke execute on function public.save_venue_pack(uuid, text, text, jsonb, boolean) from public, anon;
grant execute on function public.save_venue_pack(uuid, text, text, jsonb, boolean) to authenticated;

-- ---- publish: draft -> live (venue-scoped; qa_report set in the same UPDATE
-- so the pack_publish_guard trigger stays armed for everything else) ----
create or replace function public.publish_venue_pack(p_pack_id uuid) returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_venue uuid;
  v_n int;
begin
  select venue_id into v_venue from venue_members where user_id = (select auth.uid()) limit 1;
  if v_venue is null then raise exception 'not a venue member'; end if;
  if not exists (select 1 from packs where id = p_pack_id and venue_id = v_venue and status = 'draft') then
    raise exception 'pack is not one of your drafts';
  end if;
  select count(*) into v_n from pack_questions where pack_id = p_pack_id;
  if v_n < 5 then raise exception 'add at least 5 questions before publishing (you have %)', v_n; end if;

  update packs
     set status = 'live',
         qa_report = jsonb_build_object(
           'self_serve', true,
           'method', 'venue-authored (visible only to this venue)',
           'published_by', (select auth.uid()),
           'published_at', now()
         )
   where id = p_pack_id;
end;
$$;
revoke execute on function public.publish_venue_pack(uuid) from public, anon;
grant execute on function public.publish_venue_pack(uuid) to authenticated;

-- ---- retire: hide a live venue pack from the picker (history keeps its FK) ----
create or replace function public.retire_venue_pack(p_pack_id uuid) returns void
language plpgsql security definer set search_path = public
as $$
declare v_venue uuid;
begin
  select venue_id into v_venue from venue_members where user_id = (select auth.uid()) limit 1;
  if v_venue is null then raise exception 'not a venue member'; end if;
  update packs set status = 'retired'
   where id = p_pack_id and venue_id = v_venue and status in ('draft', 'live');
  if not found then raise exception 'pack is not yours to retire'; end if;
end;
$$;
revoke execute on function public.retire_venue_pack(uuid) from public, anon;
grant execute on function public.retire_venue_pack(uuid) to authenticated;

-- ---- create_game: venues may start nights on their OWN live packs too ----
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

  if not exists (
    select 1 from packs
     where id = p_pack_id and status = 'live'
       and (venue_id is null or venue_id = v_venue)
  ) then
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

-- ---- the website's inbound-lead form (public, rate-limited) ----
create or replace function public.submit_inquiry(
  p_email text,
  p_message text default null
) returns void
language plpgsql security definer set search_path = public
as $$
begin
  if p_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'enter a real email address';
  end if;
  if length(coalesce(p_message, '')) > 1000 then
    raise exception 'message too long';
  end if;
  if (select count(*) from events
       where kind = 'website_inquiry'
         and payload->>'email' = lower(trim(p_email))
         and created_at > now() - interval '1 day') >= 3 then
    raise exception 'we already have your note — we''ll be in touch';
  end if;
  insert into events (kind, payload)
  values ('website_inquiry', jsonb_build_object(
    'email', lower(trim(p_email)),
    'message', nullif(trim(coalesce(p_message, '')), ''),
    'source', 'trivium.games landing'
  ));
end;
$$;
grant execute on function public.submit_inquiry(text, text) to anon, authenticated;
