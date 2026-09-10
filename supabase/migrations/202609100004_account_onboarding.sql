-- New administrator-created accounts may use their assigned password immediately.
-- Self-service password changes remain available. Administrator resets retain their
-- existing forced-change, credential-lock, and session-revocation behavior.
-- Apply after 001/002/003; do not rerun or modify those migrations.
alter table public.tashan_accounts alter column must_change_password set default false;

create or replace function public.tashan_register_account(p_actor uuid, p_id uuid, p_username text, p_display_name text, p_role text, p_bootstrap boolean default false) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare account public.tashan_accounts;
begin
  perform pg_catalog.pg_advisory_xact_lock(77339103);
  if p_bootstrap then
    if p_actor is not null or p_role <> 'admin' or exists (select 1 from public.tashan_accounts) then raise exception 'E_BOOTSTRAP_CLOSED'; end if;
  else
    perform public.tashan_require_admin(p_actor);
  end if;
  if p_username !~ '^[a-z0-9][a-z0-9_-]{2,31}$' or p_role not in ('admin', 'member') or char_length(p_display_name) not between 1 and 60 then raise exception 'E_INVALID_INPUT'; end if;
  insert into public.tashan_accounts(id, username, display_name, role, must_change_password)
    values(p_id, p_username, p_display_name, p_role, false) returning * into account;
  insert into public.tashan_account_audit(actor_id, target_id, action, details)
    values(p_actor, p_id, case when p_bootstrap then 'admin_bootstrapped' else 'account_created' end, jsonb_build_object('username', p_username, 'role', p_role));
  return to_jsonb(account) - 'credential_lock' - 'credential_lock_at' - 'credentials_changed_at';
exception when unique_violation then raise exception 'E_USERNAME_TAKEN';
end;
$$;

-- Reconcile only demonstrably untouched initial-password requirements. An expired
-- lock is still skipped: it can represent an interrupted external Auth operation.
-- Missing/duplicate creation audit, unknown actions, malformed update audit, or a
-- changed credential timestamp are ambiguous and must not be silently unlocked.
do $$
begin
  perform pg_catalog.pg_advisory_xact_lock(77339103);
  with eligible as (
    select a.id from public.tashan_accounts a
    where a.status = 'active' and a.must_change_password
      and a.credential_lock is null and a.credential_lock_at is null
      and a.credentials_changed_at = '-infinity'::timestamptz
      and (select count(*) from public.tashan_account_audit e
           where e.target_id = a.id and e.action = 'account_created') = 1
      and exists (
        select 1 from public.tashan_account_audit e
        where e.target_id = a.id and e.action = 'account_created'
          and e.actor_id is not null and e.actor_id <> a.id
          and e.created_at >= a.created_at
          and e.details->>'username' = a.username
          and e.details->>'role' = a.role
      )
      and not exists (
        select 1 from public.tashan_account_audit e
        where e.target_id = a.id and (
          e.actor_id is null
          or e.action not in ('account_created', 'account_updated')
          or (e.action = 'account_updated' and not (
            case when jsonb_typeof(e.details) = 'object'
              then e.details - array['displayName','role','status'] = '{}'::jsonb
              else false
            end
          ))
        )
      )
  ), changed as (
    update public.tashan_accounts a
    set must_change_password = false, updated_at = clock_timestamp()
    from eligible e where a.id = e.id
    returning a.id
  )
  insert into public.tashan_account_audit(target_id, action, details)
    select id, 'initial_password_requirement_removed',
      jsonb_build_object('migration', '202609100004', 'reason', 'initial_password_optional')
    from changed;
end;
$$;

-- Preserve the existing function OID and service-role-only RPC boundary. Other
-- same-name overloads, account/session guards, table RLS, and Storage are untouched.
revoke all on function public.tashan_register_account(uuid,uuid,text,text,text,boolean) from public,anon,authenticated;
grant execute on function public.tashan_register_account(uuid,uuid,text,text,text,boolean) to service_role;
