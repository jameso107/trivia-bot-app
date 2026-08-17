-- ============================================================================
-- Service-role grants. New Supabase projects no longer auto-grant API roles
-- on new tables — including service_role (bypassing RLS is not the same as
-- holding table privileges). Everything trusted operates through
-- service_role: the org daemon (PRD §9) and the game edge functions.
-- ============================================================================

grant usage on schema public to service_role;
grant all on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to service_role;
grant execute on all functions in schema public to service_role;

-- And for every table later migrations create (objects created by postgres,
-- which is what runs migrations locally, via CLI push, and via the MCP):
alter default privileges in schema public grant all on tables to service_role;
alter default privileges in schema public grant usage, select on sequences to service_role;
alter default privileges in schema public grant execute on functions to service_role;
