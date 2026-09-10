-- Account data is accessible through the server only. Passwords stay in Supabase Auth.
create table public.tashan_accounts (
  id uuid primary key references auth.users(id) on delete restrict,
  username text not null unique check (username ~ '^[a-z0-9][a-z0-9_-]{2,31}$'),
  display_name text not null check (char_length(display_name) between 1 and 60),
  role text not null default 'member' check (role in ('admin', 'member')),
  status text not null default 'active' check (status in ('active', 'disabled')),
  must_change_password boolean not null default true,
  credentials_changed_at timestamptz not null default '-infinity',
  credential_lock uuid,
  credential_lock_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.tashan_account_audit (
  id bigint generated always as identity primary key,
  actor_id uuid references public.tashan_accounts(id),
  target_id uuid references public.tashan_accounts(id),
  action text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index tashan_account_audit_created on public.tashan_account_audit(created_at desc);
create table public.tashan_account_rate_limits (
  key_hash text primary key,
  requests integer not null,
  expires_at timestamptz not null
);
create index tashan_account_rate_expiry on public.tashan_account_rate_limits(expires_at);
alter table public.tashan_accounts enable row level security;
alter table public.tashan_account_audit enable row level security;
alter table public.tashan_account_rate_limits enable row level security;
revoke all on public.tashan_accounts, public.tashan_account_audit, public.tashan_account_rate_limits from public, anon, authenticated;
grant select, insert, update, delete on public.tashan_accounts, public.tashan_account_audit, public.tashan_account_rate_limits to service_role;
revoke all on sequence public.tashan_account_audit_id_seq from public, anon, authenticated;
grant usage, select on sequence public.tashan_account_audit_id_seq to service_role;

-- Mutations serialize account role changes. Re-check the actor inside each transaction.
create function public.tashan_require_admin(p_actor uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.tashan_accounts where id = p_actor and role = 'admin' and status = 'active' and not must_change_password and (credential_lock is null or credential_lock_at < clock_timestamp() - interval '5 minutes')) then
    raise exception 'E_FORBIDDEN';
  end if;
end;
$$;

create function public.tashan_session_account(p_user uuid, p_session uuid) returns jsonb
language sql security definer set search_path = '' as $$
  select to_jsonb(a) - 'credential_lock' - 'credential_lock_at' - 'credentials_changed_at'
  from public.tashan_accounts a
  where a.id = p_user and a.status = 'active' and (a.credential_lock is null or a.credential_lock_at < clock_timestamp() - interval '5 minutes')
  and exists (select 1 from auth.sessions s where s.id = p_session and s.user_id = p_user and s.created_at >= a.credentials_changed_at);
$$;

create function public.tashan_rate_limit(p_key_hash text, p_limit integer, p_window_seconds integer) returns boolean
language plpgsql security definer set search_path = '' as $$
declare current_count integer;
begin
  if p_limit < 1 or p_limit > 1000 or p_window_seconds < 1 or p_window_seconds > 86400 or length(p_key_hash) <> 64 then raise exception 'E_INVALID_INPUT'; end if;
  delete from public.tashan_account_rate_limits where expires_at < now() - interval '1 day';
  insert into public.tashan_account_rate_limits (key_hash, requests, expires_at)
    values (p_key_hash, 1, now() + make_interval(secs => p_window_seconds))
  on conflict (key_hash) do update set
    requests = case when public.tashan_account_rate_limits.expires_at <= now() then 1 else least(public.tashan_account_rate_limits.requests + 1, p_limit + 1) end,
    expires_at = case when public.tashan_account_rate_limits.expires_at <= now() then now() + make_interval(secs => p_window_seconds) else public.tashan_account_rate_limits.expires_at end
  returning requests into current_count;
  return current_count <= p_limit;
end;
$$;

create function public.tashan_register_account(p_actor uuid, p_id uuid, p_username text, p_display_name text, p_role text, p_bootstrap boolean default false) returns jsonb
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
    values(p_id, p_username, p_display_name, p_role, not p_bootstrap) returning * into account;
  insert into public.tashan_account_audit(actor_id, target_id, action, details)
    values(p_actor, p_id, case when p_bootstrap then 'admin_bootstrapped' else 'account_created' end, jsonb_build_object('username', p_username, 'role', p_role));
  return to_jsonb(account) - 'credential_lock' - 'credential_lock_at' - 'credentials_changed_at';
exception when unique_violation then raise exception 'E_USERNAME_TAKEN';
end;
$$;

create function public.tashan_list_accounts(p_actor uuid, p_query text default '', p_page integer default 1) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare rows jsonb; total bigint;
begin
  perform public.tashan_require_admin(p_actor);
  if p_page < 1 or p_page > 10000 or length(p_query) > 60 then raise exception 'E_INVALID_INPUT'; end if;
  select count(*) into total from public.tashan_accounts a where p_query = '' or strpos(lower(a.username), lower(p_query)) > 0 or strpos(lower(a.display_name), lower(p_query)) > 0;
  select coalesce(jsonb_agg(to_jsonb(q) - 'credential_lock' - 'credential_lock_at' - 'credentials_changed_at'), '[]'::jsonb) into rows
  from (select * from public.tashan_accounts a where p_query = '' or strpos(lower(a.username), lower(p_query)) > 0 or strpos(lower(a.display_name), lower(p_query)) > 0 order by created_at desc, id limit 20 offset (p_page - 1) * 20) q;
  return jsonb_build_object('users', rows, 'total', total, 'page', p_page, 'pageSize', 20);
end;
$$;

create function public.tashan_update_account(p_actor uuid, p_id uuid, p_changes jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare target public.tashan_accounts; new_role text; new_status text;
begin
  perform pg_catalog.pg_advisory_xact_lock(77339103);
  perform public.tashan_require_admin(p_actor);
  select * into target from public.tashan_accounts where id = p_id for update;
  if not found then raise exception 'E_NOT_FOUND'; end if;
  if target.credential_lock is not null and target.credential_lock_at > clock_timestamp() - interval '5 minutes' then raise exception 'E_ACCOUNT_BUSY'; end if;
  if exists(select 1 from jsonb_object_keys(p_changes) k where k not in ('displayName', 'role', 'status')) then raise exception 'E_INVALID_INPUT'; end if;
  new_role := coalesce(p_changes->>'role', target.role);
  new_status := coalesce(p_changes->>'status', target.status);
  if new_role not in ('admin', 'member') or new_status not in ('active', 'disabled') or (p_changes ? 'displayName' and char_length(p_changes->>'displayName') not between 1 and 60) then raise exception 'E_INVALID_INPUT'; end if;
  if p_actor = p_id and (new_role <> 'admin' or new_status <> 'active') then raise exception 'E_SELF_LOCKOUT'; end if;
  if target.role = 'admin' and target.status = 'active' and (new_role <> 'admin' or new_status <> 'active') and not exists(select 1 from public.tashan_accounts where role = 'admin' and status = 'active' and id <> p_id) then raise exception 'E_LAST_ADMIN'; end if;
  update public.tashan_accounts set display_name = coalesce(p_changes->>'displayName', display_name), role = new_role, status = new_status,
    credentials_changed_at = case when new_status = 'disabled' or new_role <> target.role then clock_timestamp() else credentials_changed_at end,
    updated_at = clock_timestamp() where id = p_id returning * into target;
  insert into public.tashan_account_audit(actor_id, target_id, action, details) values(p_actor, p_id, 'account_updated', p_changes);
  return to_jsonb(target) - 'credential_lock' - 'credential_lock_at' - 'credentials_changed_at';
end;
$$;

-- A reset locks platform access before the external Auth request. A short-lived lock
-- can be reclaimed after an interrupted request; stale finalize tokens cannot unlock it.
create function public.tashan_begin_password_change(p_actor uuid, p_id uuid, p_admin_reset boolean) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare target public.tashan_accounts; lock_id uuid := gen_random_uuid();
begin
  perform pg_catalog.pg_advisory_xact_lock(77339103);
  if p_admin_reset then
    perform public.tashan_require_admin(p_actor);
    if p_actor = p_id then raise exception 'E_SELF_LOCKOUT'; end if;
  elsif p_actor <> p_id then raise exception 'E_FORBIDDEN';
  end if;
  select * into target from public.tashan_accounts where id = p_id for update;
  if not found then raise exception 'E_NOT_FOUND'; end if;
  if not p_admin_reset and target.status <> 'active' then raise exception 'E_FORBIDDEN'; end if;
  if target.credential_lock is not null and target.credential_lock_at > clock_timestamp() - interval '5 minutes' then raise exception 'E_ACCOUNT_BUSY'; end if;
  update public.tashan_accounts set credential_lock = lock_id, credential_lock_at = clock_timestamp(), credentials_changed_at = clock_timestamp(),
    must_change_password = case when p_admin_reset then true else must_change_password end,
    updated_at = clock_timestamp() where id = p_id;
  insert into public.tashan_account_audit(actor_id, target_id, action) values(p_actor, p_id, case when p_admin_reset then 'password_reset_started' else 'password_change_started' end);
  return jsonb_build_object('lock', lock_id, 'username', target.username);
end;
$$;

create function public.tashan_finish_password_change(p_id uuid, p_lock uuid, p_actor uuid, p_admin_reset boolean, p_success boolean) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare target public.tashan_accounts;
begin
  perform pg_catalog.pg_advisory_xact_lock(77339103);
  update public.tashan_accounts set credential_lock = null, credential_lock_at = null,
    must_change_password = case when p_success then p_admin_reset else must_change_password end,
    updated_at = clock_timestamp() where id = p_id and credential_lock = p_lock returning * into target;
  if not found then raise exception 'E_ACCOUNT_BUSY'; end if;
  insert into public.tashan_account_audit(actor_id, target_id, action) values(p_actor, p_id,
    case when not p_success then 'password_operation_failed' when p_admin_reset then 'password_reset' else 'password_changed' end);
  return to_jsonb(target) - 'credential_lock' - 'credential_lock_at' - 'credentials_changed_at';
end;
$$;

create function public.tashan_list_audit(p_actor uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare events jsonb;
begin
  perform public.tashan_require_admin(p_actor);
  select coalesce(jsonb_agg(to_jsonb(q)), '[]'::jsonb) into events from (
    select e.id, e.action, e.details, e.created_at, a.username as actor_username, t.username as target_username
    from public.tashan_account_audit e left join public.tashan_accounts a on a.id = e.actor_id left join public.tashan_accounts t on t.id = e.target_id
    order by e.created_at desc, e.id desc limit 100
  ) q;
  return jsonb_build_object('events', events);
end;
$$;

-- Restrict only the exact functions created above. Existing same-prefix functions
-- and overloads belong to their own migrations and must retain their permissions.
do $$ declare signature regprocedure; begin
  foreach signature in array array[
    'public.tashan_require_admin(uuid)'::regprocedure,
    'public.tashan_session_account(uuid,uuid)'::regprocedure,
    'public.tashan_rate_limit(text,integer,integer)'::regprocedure,
    'public.tashan_register_account(uuid,uuid,text,text,text,boolean)'::regprocedure,
    'public.tashan_list_accounts(uuid,text,integer)'::regprocedure,
    'public.tashan_update_account(uuid,uuid,jsonb)'::regprocedure,
    'public.tashan_begin_password_change(uuid,uuid,boolean)'::regprocedure,
    'public.tashan_finish_password_change(uuid,uuid,uuid,boolean,boolean)'::regprocedure,
    'public.tashan_list_audit(uuid)'::regprocedure
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', signature);
    execute format('grant execute on function %s to service_role', signature);
  end loop;
end $$;
