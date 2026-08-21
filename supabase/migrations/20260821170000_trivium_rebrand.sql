-- TRIVIUM rebrand (owner decision 2026-08-21, brain D-011): the public brand
-- is TRIVIUM; repos and internal names stay trivia-bot. This updates the only
-- DB-seeded public copy — the house ad creatives from 20260817000900_org_ads.
update public.ad_creatives
set text = replace(text, 'Trivia Bot', 'TRIVIUM')
where kind = 'house' and text like '%Trivia Bot%';
