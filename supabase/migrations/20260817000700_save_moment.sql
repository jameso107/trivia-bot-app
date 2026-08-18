-- ============================================================================
-- M4: the save moment. Schema already carries profiles + attribution (PRD §4);
-- this adds the lookup path /me uses (players by profile).
-- ============================================================================

create index on game_players (profile_id) where profile_id is not null;
