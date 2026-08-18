-- ============================================================================
-- M3: auto-host personality — ~60 seed lines across all slots (PRD §6).
-- Data-driven on purpose: the org's content ops INSERT/UPDATE these with no
-- deploy (PRD §9). Voice per brand-voice.md: sharp warm friend; teasing,
-- never cruel; punches at questions and concepts, never at players or the bar.
-- Plus the public bucket the TTS pipeline will drop audio into.
-- ============================================================================

insert into host_lines (slot, text) values
  -- lobby: the billboard. Get phones out, build the room.
  ('lobby', 'Phones out. Pride up. History will remember tonight.'),
  ('lobby', 'Scan the code. Pick a team name you won''t regret by round 2.'),
  ('lobby', 'Tonight''s forecast: 4 rounds, 1 final wager, zero mercy from the scoreboard.'),
  ('lobby', 'Assemble your smartest table. Or your loudest. Both work.'),
  ('lobby', 'The bar owns the music. We own the questions. You own the excuses.'),
  ('lobby', 'Team names are forever. Choose like your grandmother will read it.'),
  ('lobby', 'No host, no waiting, no ''can everyone hear me?'' Just trivia.'),
  ('lobby', 'Warm up your worst guesses. Sometimes they''re right.'),

  -- round_intro
  ('round_intro', 'New round, clean slate. Mostly.'),
  ('round_intro', 'This round ends with a closer that starts arguments. You''ve been warned.'),
  ('round_intro', 'Stretch your brains. We go again.'),
  ('round_intro', 'Somebody at your table knows this stuff. Find them.'),
  ('round_intro', 'Rules haven''t changed: fast counts, right counts more.'),
  ('round_intro', 'The questions get meaner from here. Affectionately.'),
  ('round_intro', 'Deep breath. It''s just trivia. It''s also everything.'),

  -- pre_reveal: the drumroll while answers are locked
  ('pre_reveal', 'Answers are locked. Alliances are about to be tested.'),
  ('pre_reveal', 'Locked in. Somebody''s about to be insufferable.'),
  ('pre_reveal', 'Pencils down. Metaphorically. It''s all phones.'),
  ('pre_reveal', 'The correct answer is on its way. Act natural.'),
  ('pre_reveal', 'No takebacks now.'),
  ('pre_reveal', 'Hold that confidence. We''ll see if it''s earned.'),
  ('pre_reveal', 'Somewhere in this room, someone is exactly right.'),
  ('pre_reveal', 'Drumroll optional. Suspense mandatory.'),

  -- post_reveal_correct: the room mostly nailed it
  ('post_reveal_correct', 'Look at this room. Scholars, all of you.'),
  ('post_reveal_correct', 'That one didn''t stand a chance.'),
  ('post_reveal_correct', 'Correct answers everywhere. The questions demand a rematch.'),
  ('post_reveal_correct', 'Well played. The scoreboard noticed.'),
  ('post_reveal_correct', 'Smart bar. Dangerous bar.'),
  ('post_reveal_correct', 'You make this look easy. It wasn''t supposed to be.'),
  ('post_reveal_correct', 'The trivia gods nod approvingly.'),

  -- post_reveal_brutal: the room mostly missed it — tease the QUESTION, not them
  ('post_reveal_brutal', 'In fairness, that question was rude.'),
  ('post_reveal_brutal', 'The scoreboard would like a moment of silence.'),
  ('post_reveal_brutal', 'Somewhere a librarian just sighed. Not us though. Never us.'),
  ('post_reveal_brutal', 'That one bit. Shake it off — redemption is one question away.'),
  ('post_reveal_brutal', 'Blame the question. We do.'),
  ('post_reveal_brutal', 'A humbling for the whole room. Free of charge.'),
  ('post_reveal_brutal', 'Wrong, but with conviction. That''s worth something. (It''s worth 0 points.)'),

  -- intermission
  ('intermission', 'Between rounds. Hydrate. Strategize. Order the nachos.'),
  ('intermission', 'Halftime wisdom: the table laughing hardest usually wins. Or loses. It''s a coin flip.'),
  ('intermission', 'Scores are close enough to be interesting. Do something about it.'),
  ('intermission', 'This is a great time to tip your bartender.'),
  ('intermission', 'Rest those brains. The next round has opinions.'),
  ('intermission', 'Check the standings. File complaints with the podium.'),
  ('intermission', 'Trash talk window: now open.'),
  ('intermission', 'Back shortly. The questions are limbering up.'),

  -- final_intro
  ('final_intro', 'The final question. Wager like you mean it.'),
  ('final_intro', 'One question left. Points on the line. Choose your bravery.'),
  ('final_intro', 'Time to bet. Cowards keep points. Legends risk them.'),
  ('final_intro', 'The final: where leads evaporate and legends clock in.'),
  ('final_intro', 'All night for this. Make your wager count.'),

  -- podium
  ('podium', 'Podium time. Somebody''s buying a round.'),
  ('podium', 'The results are in. Hug your teammates or blame them.'),
  ('podium', 'Champions were crowned tonight. The rest of you: witnesses.'),
  ('podium', 'Scoreboard''s final. Feelings may take longer.'),
  ('podium', 'Remember this feeling. Both kinds.'),

  -- close
  ('close', 'That''s the night. Same time next week — bring reinforcements.'),
  ('close', 'Good night, good game, drive safe, tip well.'),
  ('close', 'The questions rest. You should celebrate.'),
  ('close', 'You were great. The scoreboard was honest. See you next week.'),
  ('close', 'Trivia''s done. The debate at your table doesn''t have to be.');

-- Public bucket for pre-generated TTS clips (org uploads; console plays).
insert into storage.buckets (id, name, public)
values ('host-audio', 'host-audio', true)
on conflict (id) do nothing;
