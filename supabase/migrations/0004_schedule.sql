-- Sweep schedule. pg_cron runs sweep_leases every minute when the extension is available.
-- When it is not, every connected client calls sweep_leases every 30 seconds instead (see PROJECT_CAPSULE.md).
do $$
begin
  begin
    create extension if not exists pg_cron;
    perform cron.schedule('weconnect-sweep', '* * * * *', $cron$select sweep_leases('cron-' || gen_random_uuid()::text)$cron$);
  exception when others then
    raise notice 'pg_cron unavailable (%); client sweep remains the fallback', sqlerrm;
  end;
end $$;
