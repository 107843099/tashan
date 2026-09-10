-- Affiliation is account metadata, never an authorization or ownership claim.
-- Existing accounts retain credentials, roles, sessions and timestamps. Apply
-- after 005 in one transaction; no Auth identities or Storage objects are changed.
alter table public.tashan_accounts
  add column affiliation_type text not null default 'personal',
  add column organization_name text not null default '',
  add constraint tashan_accounts_affiliation_valid check (
    affiliation_type in ('personal','school','organization')
    and ((affiliation_type = 'personal' and organization_name = '') or (
      affiliation_type in ('school','organization')
      and char_length(organization_name) between 1 and 100
      and organization_name = btrim(organization_name, U&'\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF')
      and organization_name !~ U&'[\0001-\001F\007F-\009F]'
    ))
  );

-- A distinct RPC name avoids PostgREST overload ambiguity. Keep the existing
-- six-parameter tashan_register_account function unchanged for older servers;
-- its explicit column insert receives the new personal/empty defaults.
create function public.tashan_register_account_profile(
  p_actor uuid, p_id uuid, p_username text, p_display_name text, p_role text,
  p_bootstrap boolean, p_affiliation_type text, p_organization_name text
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare account public.tashan_accounts; organization text;
begin
  perform pg_catalog.pg_advisory_xact_lock(77339103);
  if p_bootstrap then
    if p_actor is not null or p_role <> 'admin' or exists (select 1 from public.tashan_accounts) then raise exception 'E_BOOTSTRAP_CLOSED'; end if;
  else
    perform public.tashan_require_admin(p_actor);
  end if;
  if p_username is null or p_username !~ '^[a-z0-9][a-z0-9_-]{2,31}$' or p_role is null or p_role not in ('admin','member') or p_display_name is null or char_length(p_display_name) not between 1 and 60 then raise exception 'E_INVALID_INPUT'; end if;
  if p_affiliation_type is null or p_affiliation_type not in ('personal','school','organization') then raise exception 'E_INVALID_AFFILIATION'; end if;
  if p_affiliation_type = 'personal' then organization := '';
  else
    if p_organization_name is null or p_organization_name ~ U&'[\0001-\001F\007F-\009F]' then raise exception 'E_INVALID_ORGANIZATION'; end if;
    organization := btrim(p_organization_name, U&'\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF');
    if char_length(organization) not between 1 and 100 then raise exception 'E_INVALID_ORGANIZATION'; end if;
  end if;
  insert into public.tashan_accounts(id,username,display_name,role,must_change_password,affiliation_type,organization_name)
    values(p_id,p_username,p_display_name,p_role,false,p_affiliation_type,organization) returning * into account;
  insert into public.tashan_account_audit(actor_id,target_id,action,details)
    values(p_actor,p_id,case when p_bootstrap then 'admin_bootstrapped' else 'account_created' end,
      jsonb_build_object('username',p_username,'role',p_role,'affiliationType',p_affiliation_type,'organizationName',organization));
  return to_jsonb(account) - 'credential_lock' - 'credential_lock_at' - 'credentials_changed_at';
exception when unique_violation then raise exception 'E_USERNAME_TAKEN';
end;
$$;

create or replace function public.tashan_update_account(p_actor uuid, p_id uuid, p_changes jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare target public.tashan_accounts; new_role text; new_status text; new_affiliation text; organization text; audit_changes jsonb;
begin
  perform pg_catalog.pg_advisory_xact_lock(77339103);
  perform public.tashan_require_admin(p_actor);
  select * into target from public.tashan_accounts where id = p_id for update;
  if not found then raise exception 'E_NOT_FOUND'; end if;
  if target.credential_lock is not null and target.credential_lock_at > clock_timestamp() - interval '5 minutes' then raise exception 'E_ACCOUNT_BUSY'; end if;
  if p_changes is null or jsonb_typeof(p_changes) <> 'object' or p_changes = '{}'::jsonb then raise exception 'E_INVALID_INPUT'; end if;
  if exists(select 1 from jsonb_each(p_changes) item where item.key not in ('displayName','role','status','affiliationType','organizationName') or jsonb_typeof(item.value) <> 'string') then raise exception 'E_INVALID_INPUT'; end if;
  new_role := coalesce(p_changes->>'role', target.role);
  new_status := coalesce(p_changes->>'status', target.status);
  if new_role not in ('admin','member') or new_status not in ('active','disabled') or (p_changes ? 'displayName' and char_length(p_changes->>'displayName') not between 1 and 60) then raise exception 'E_INVALID_INPUT'; end if;
  new_affiliation := coalesce(p_changes->>'affiliationType',target.affiliation_type);
  if new_affiliation not in ('personal','school','organization') then raise exception 'E_INVALID_AFFILIATION'; end if;
  if new_affiliation = 'personal' then organization := '';
  else
    organization := coalesce(p_changes->>'organizationName',target.organization_name);
    if organization ~ U&'[\0001-\001F\007F-\009F]' then raise exception 'E_INVALID_ORGANIZATION'; end if;
    organization := btrim(organization, U&'\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF');
    if char_length(organization) not between 1 and 100 then raise exception 'E_INVALID_ORGANIZATION'; end if;
  end if;
  if p_actor = p_id and (new_role <> 'admin' or new_status <> 'active') then raise exception 'E_SELF_LOCKOUT'; end if;
  if target.role = 'admin' and target.status = 'active' and (new_role <> 'admin' or new_status <> 'active') and not exists(select 1 from public.tashan_accounts where role = 'admin' and status = 'active' and id <> p_id) then raise exception 'E_LAST_ADMIN'; end if;
  update public.tashan_accounts set display_name = coalesce(p_changes->>'displayName',display_name), role = new_role, status = new_status,
    affiliation_type = new_affiliation, organization_name = organization,
    credentials_changed_at = case when new_status = 'disabled' or new_role <> target.role then clock_timestamp() else credentials_changed_at end,
    updated_at = clock_timestamp() where id = p_id returning * into target;
  audit_changes := p_changes;
  if p_changes ? 'affiliationType' or p_changes ? 'organizationName' then
    audit_changes := audit_changes || jsonb_build_object('affiliationType',new_affiliation,'organizationName',organization);
  end if;
  insert into public.tashan_account_audit(actor_id,target_id,action,details) values(p_actor,p_id,'account_updated',audit_changes);
  return to_jsonb(target) - 'credential_lock' - 'credential_lock_at' - 'credentials_changed_at';
end;
$$;

revoke all on function public.tashan_register_account_profile(uuid,uuid,text,text,text,boolean,text,text) from public,anon,authenticated;
grant execute on function public.tashan_register_account_profile(uuid,uuid,text,text,text,boolean,text,text) to service_role;
revoke all on function public.tashan_update_account(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.tashan_update_account(uuid,uuid,jsonb) to service_role;
notify pgrst, 'reload schema';
