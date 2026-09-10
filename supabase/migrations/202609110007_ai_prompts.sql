-- Administrator-editable teaching instructions. Fixed AI safety/schema rules
-- remain in server code. No seeded rows: an absent task resolves to code defaults.
-- Apply once after 006 in one transaction. Existing accounts and projects remain
-- untouched, and restoring defaults retains a revision to prevent stale writes.
create table public.tashan_ai_prompts (
  task text primary key check(task in ('upload','teaching','prompt')),
  prompt text check(prompt is null or (
    char_length(prompt) between 1 and 4000
    and prompt !~ U&'[\0001-\0008\000B-\001F\007F-\009F]'
    and prompt = btrim(prompt,U&'\0009\000A\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF')
  )),
  revision bigint not null check(revision between 1 and 9007199254740991),
  updated_at timestamptz not null default clock_timestamp(),
  updated_by uuid not null references public.tashan_accounts(id) on delete restrict
);
alter table public.tashan_ai_prompts enable row level security;
revoke all on public.tashan_ai_prompts from public,anon,authenticated;
grant select,insert,update,delete on public.tashan_ai_prompts to service_role;

-- Internal server read for generation. Never exposed as an anonymous platform API.
create function public.tashan_get_ai_prompt(p_task text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare result jsonb;
begin
  if p_task is null or p_task not in ('upload','teaching','prompt') then raise exception 'E_AI_PROMPT_INVALID'; end if;
  select jsonb_build_object('task',p.task,'prompt',p.prompt,'revision',p.revision,'updatedAt',p.updated_at,
    'updatedBy',jsonb_build_object('id',a.id,'username',a.username,'displayName',a.display_name)) into result
  from public.tashan_ai_prompts p left join public.tashan_accounts a on a.id=p.updated_by where p.task=p_task;
  return result;
end;
$$;

create function public.tashan_list_ai_prompts(p_actor uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare result jsonb;
begin
  perform public.tashan_require_admin(p_actor);
  select coalesce(jsonb_agg(public.tashan_get_ai_prompt(p.task) order by p.task),'[]'::jsonb) into result from public.tashan_ai_prompts p;
  return jsonb_build_object('prompts',result);
end;
$$;

create function public.tashan_update_ai_prompt(p_actor uuid,p_task text,p_prompt text,p_expected_revision bigint) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare current_revision bigint; new_revision bigint; value text;
begin
  -- Shares the account mutation lock: an administrator cannot be disabled or
  -- demoted between authorization and this write. Also serializes first inserts.
  perform pg_catalog.pg_advisory_xact_lock(77339103);
  perform public.tashan_require_admin(p_actor);
  if p_task is null or p_task not in ('upload','teaching','prompt') or p_expected_revision is null or p_expected_revision < 0 or p_expected_revision >= 9007199254740991 then raise exception 'E_AI_PROMPT_INVALID'; end if;
  value := p_prompt;
  if value is not null then
    if value ~ U&'[\0001-\0008\000B\000C\000E-\001F\007F-\009F]' then raise exception 'E_AI_PROMPT_INVALID'; end if;
    value := btrim(replace(replace(value,E'\r\n',E'\n'),E'\r',E'\n'),U&'\0009\000A\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF');
    if char_length(value) not between 1 and 4000 then raise exception 'E_AI_PROMPT_INVALID'; end if;
  end if;
  select revision into current_revision from public.tashan_ai_prompts where task=p_task for update;
  if coalesce(current_revision,0) <> p_expected_revision then raise exception 'E_AI_PROMPT_CONFLICT'; end if;
  new_revision := p_expected_revision+1;
  insert into public.tashan_ai_prompts(task,prompt,revision,updated_at,updated_by)
    values(p_task,value,new_revision,clock_timestamp(),p_actor)
    on conflict(task) do update set prompt=excluded.prompt,revision=excluded.revision,updated_at=excluded.updated_at,updated_by=excluded.updated_by;
  insert into public.tashan_account_audit(actor_id,action,details)
    values(p_actor,'ai_prompt.updated',jsonb_build_object('task',p_task,'revision',new_revision,'reset',value is null));
  return public.tashan_get_ai_prompt(p_task);
end;
$$;

revoke all on function public.tashan_get_ai_prompt(text) from public,anon,authenticated;
revoke all on function public.tashan_list_ai_prompts(uuid) from public,anon,authenticated;
revoke all on function public.tashan_update_ai_prompt(uuid,text,text,bigint) from public,anon,authenticated;
grant execute on function public.tashan_get_ai_prompt(text) to service_role;
grant execute on function public.tashan_list_ai_prompts(uuid) to service_role;
grant execute on function public.tashan_update_ai_prompt(uuid,text,text,bigint) to service_role;
notify pgrst, 'reload schema';
