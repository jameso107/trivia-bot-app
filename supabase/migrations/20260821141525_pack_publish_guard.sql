-- Pack publish guard (auditor incident 2026-08-21, policy §4): no UPDATE may
-- make a pack live without an attached qa_report. INSERT is deliberately
-- exempt: seed/build tooling inserts already-reviewed packs directly (builder
-- pod path, gated by CI); the agent promotion path is always an UPDATE, and
-- set_pack_status already enforces the ship-bar in code — this is defense in
-- depth at the database layer.
-- Applied to prod via MCP 2026-08-21 (version 20260821141525); this file is
-- the repo mirror for local/CI databases.
create or replace function public.enforce_pack_qa_report()
returns trigger
language plpgsql
as $$
begin
  raise exception 'packs: cannot set status=live without qa_report (policy §4)';
end;
$$;

drop trigger if exists pack_publish_guard on public.packs;
create trigger pack_publish_guard
  before update on public.packs
  for each row
  when (new.status = 'live' and new.qa_report is null)
  execute function public.enforce_pack_qa_report();
