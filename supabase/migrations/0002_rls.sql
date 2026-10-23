-- Row level security: anon may read everything, nobody writes directly.
-- All writes go through security definer RPCs (0003_functions.sql).
alter table settings enable row level security;
alter table donors enable row level security;
alter table shelters enable row level security;
alter table riders enable row level security;
alter table batches enable row level security;
alter table allocations enable row level security;
alter table leases enable row level security;
alter table compatibility_rules enable row level security;
alter table events enable row level security;
alter table incidents enable row level security;
alter table unresolved enable row level security;
alter table action_log enable row level security;

create policy read_settings on settings for select using (true);
create policy read_donors on donors for select using (true);
create policy read_shelters on shelters for select using (true);
create policy read_riders on riders for select using (true);
create policy read_batches on batches for select using (true);
create policy read_allocations on allocations for select using (true);
create policy read_leases on leases for select using (true);
create policy read_rules on compatibility_rules for select using (true);
create policy read_events on events for select using (true);
create policy read_incidents on incidents for select using (true);
create policy read_unresolved on unresolved for select using (true);
-- action_log has no read policy: clients never read it.

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke insert, update, delete, truncate on all tables in schema public from anon;
    revoke all on action_log from anon;
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke insert, update, delete, truncate on all tables in schema public from authenticated;
  end if;
end $$;

-- Realtime publication, when the Supabase publication exists.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table leases, allocations, batches, shelters, riders, events, unresolved, incidents;
  end if;
end $$;
