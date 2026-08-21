-- TRIVIUM rebrand (owner decision 2026-08-21, brain D-011): the public brand
-- is TRIVIUM; repos and internal names stay trivia-bot. This updates the only
-- DB-seeded public copy — the house ad creatives from 20260817000900_org_ads.
-- (cta_url still points at the vercel.app host; it moves when trivium.games
-- is live.)
update public.ad_creatives
set headline = replace(headline, 'Trivia Bot', 'TRIVIUM'),
    body = replace(body, 'Trivia Bot', 'TRIVIUM')
where kind = 'house'
  and (headline like '%Trivia Bot%' or body like '%Trivia Bot%');
