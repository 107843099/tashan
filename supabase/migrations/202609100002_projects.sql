-- Version snapshots are private until their owner explicitly publishes a ready version.
create table public.tashan_projects (
 id text primary key check(id ~ '^local-[A-Za-z0-9][A-Za-z0-9_-]{0,95}$'),
 owner_id uuid not null references public.tashan_accounts(id),
 project_code text not null unique check(project_code ~ '^TS-L-[A-F0-9]{16}$'),
 published_version_id text,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create index tashan_projects_owner on public.tashan_projects(owner_id,updated_at desc);
create table public.tashan_project_versions (
 id text primary key check(id ~ '^version-[A-Za-z0-9][A-Za-z0-9_-]{0,91}$'),
 project_id text not null references public.tashan_projects(id),
 number integer not null check(number>0),created_at timestamptz not null,
 note text not null default '',source_references jsonb not null default '[]',
 metadata jsonb not null,files jsonb not null default '{}',fingerprint text not null check(fingerprint ~ '^[a-f0-9]{64}$'),
 ready boolean not null default false,received_at timestamptz not null default now(),
 unique(project_id,number),unique(project_id,id)
);
alter table public.tashan_projects add constraint tashan_publication_version foreign key(id,published_version_id) references public.tashan_project_versions(project_id,id) deferrable initially deferred;
create table public.tashan_project_assets (
 id text primary key,owner_id uuid not null references public.tashan_accounts(id),sha256 text not null check(sha256 ~ '^[a-f0-9]{64}$'),
 size bigint not null check(size>=0),unique(owner_id,sha256)
);
alter table public.tashan_projects enable row level security;
alter table public.tashan_project_versions enable row level security;
alter table public.tashan_project_assets enable row level security;
revoke all on public.tashan_projects,public.tashan_project_versions,public.tashan_project_assets from public,anon,authenticated;
grant select,insert,update,delete on public.tashan_projects,public.tashan_project_versions,public.tashan_project_assets to service_role;

-- Provision the private "tashan-projects" bucket separately through the Storage
-- API, with public=false and file_size_limit=20971520. Inspect an existing bucket
-- and its policies before reusing it; this migration never changes Storage rows.
-- Only server credentials upload/download objects. No signed public URLs are issued.

create function public.tashan_project_actor(p_actor uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from public.tashan_accounts where id=p_actor and status='active' and not must_change_password and (credential_lock is null or credential_lock_at<clock_timestamp()-interval '5 minutes')) then raise exception 'E_FORBIDDEN';end if;
end;$$;

create function public.tashan_project_summary(p_id text,p_public boolean default false) returns jsonb language sql security definer set search_path='' as $$
 select jsonb_build_object('id',p.id,'projectCode',p.project_code,'title',v.metadata->'title','kind',v.metadata->>'kind','subject',coalesce(v.metadata->>'subject',''),
 'latestVersionId',v.id,'latestVersionNumber',v.number,'publishedVersionId',p.published_version_id,'publishedVersionNumber',published.number,
 'coverURL',case when v.files ? 'coverFile' then '/api/v1/'||(case when p_public then 'published' else 'projects' end)||'/'||p.id||'/versions/'||v.id||'/files/coverFile' else null end,
 'createdAt',p.created_at,'updatedAt',case when p_public then v.created_at else p.updated_at end)
 from public.tashan_projects p
 left join public.tashan_project_versions published on published.id=p.published_version_id and published.project_id=p.id
 left join public.tashan_project_versions v on v.id=case when p_public then p.published_version_id else(select latest.id from public.tashan_project_versions latest where latest.project_id=p.id and latest.ready order by latest.number desc limit 1)end
 where p.id=p_id;
$$;

create function public.tashan_project_list(p_actor uuid,p_page integer default 1) returns jsonb language plpgsql security definer set search_path='' as $$
declare items jsonb;total bigint;
begin
 perform public.tashan_project_actor(p_actor);
 if p_page<1 or p_page>10000 then raise exception 'E_INVALID_INPUT';end if;
 select count(*) into total from public.tashan_projects p where owner_id=p_actor and exists(select 1 from public.tashan_project_versions v where v.project_id=p.id and v.ready);
 select coalesce(jsonb_agg(public.tashan_project_summary(q.id,false)),'[]') into items from(select p.id from public.tashan_projects p where owner_id=p_actor and exists(select 1 from public.tashan_project_versions v where v.project_id=p.id and v.ready) order by p.updated_at desc,p.id limit 24 offset(p_page-1)*24)q;
 return jsonb_build_object('projects',items,'total',total,'page',p_page,'pageSize',24);
end;$$;

create function public.tashan_project_get(p_actor uuid,p_id text,p_public boolean default false) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if not p_public then perform public.tashan_project_actor(p_actor);end if;
 if not exists(select 1 from public.tashan_projects p join public.tashan_accounts a on a.id=p.owner_id where p.id=p_id and(case when p_public then p.published_version_id is not null and a.status='active' else p.owner_id=p_actor end))then raise exception 'E_PROJECT_NOT_FOUND';end if;
 return public.tashan_project_summary(p_id,p_public);
end;$$;

create function public.tashan_project_published(p_page integer default 1) returns jsonb language plpgsql security definer set search_path='' as $$
declare items jsonb;total bigint;
begin
 if p_page<1 or p_page>10000 then raise exception 'E_INVALID_INPUT';end if;
 select count(*) into total from public.tashan_projects p join public.tashan_accounts a on a.id=p.owner_id where p.published_version_id is not null and a.status='active';
 select coalesce(jsonb_agg(public.tashan_project_summary(q.id,true)),'[]') into items from(select p.id from public.tashan_projects p join public.tashan_accounts a on a.id=p.owner_id join public.tashan_project_versions v on v.id=p.published_version_id and v.project_id=p.id where a.status='active' order by v.created_at desc,p.id limit 24 offset(p_page-1)*24)q;
 return jsonb_build_object('projects',items,'total',total,'page',p_page,'pageSize',24);
end;$$;

create function public.tashan_project_version(p_actor uuid,p_id text,p_version text,p_public boolean default false) returns jsonb language plpgsql security definer set search_path='' as $$
declare project public.tashan_projects;version public.tashan_project_versions;
begin
 if not p_public then perform public.tashan_project_actor(p_actor);end if;
 select p.* into project from public.tashan_projects p join public.tashan_accounts a on a.id=p.owner_id where p.id=p_id and(case when p_public then p.published_version_id=p_version and a.status='active' else p.owner_id=p_actor end);
 if not found then raise exception 'E_PROJECT_NOT_FOUND';end if;
 select * into version from public.tashan_project_versions where id=p_version and project_id=p_id and ready;
 if not found then raise exception 'E_PROJECT_NOT_FOUND';end if;
 return jsonb_build_object('project',public.tashan_project_summary(p_id,p_public),'version',jsonb_build_object('id',version.id,'number',version.number,'createdAt',version.created_at,'note',version.note,'sourceReferences',version.source_references,'metadata',version.metadata,'files',version.files));
end;$$;

create function public.tashan_project_versions(p_actor uuid,p_id text) returns jsonb language plpgsql security definer set search_path='' as $$
declare items jsonb;
begin
 perform public.tashan_project_actor(p_actor);
 if not exists(select 1 from public.tashan_projects where id=p_id and owner_id=p_actor) then raise exception 'E_PROJECT_NOT_FOUND';end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'number',number,'createdAt',created_at,'note',note,'sourceReferences',source_references,'fingerprint',fingerprint) order by number desc),'[]') into items from public.tashan_project_versions where project_id=p_id and ready;
 return jsonb_build_object('project',public.tashan_project_summary(p_id,false),'versions',items);
end;$$;

-- Reserve immutable metadata and quota before network uploads. A failed upload can
-- retry the same version; it remains invisible until every object is committed.
create function public.tashan_project_prepare(p_actor uuid,p_snapshot jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare project public.tashan_projects;prior public.tashan_project_versions;file record;used bigint;extra bigint:=0;metadata_size bigint;seen text[]:=array[]::text[];
begin
 perform pg_catalog.pg_advisory_xact_lock(77339103);
 perform public.tashan_project_actor(p_actor);
 select * into project from public.tashan_projects where id=p_snapshot->>'projectId';
 if found and project.owner_id<>p_actor then raise exception 'E_PROJECT_NOT_FOUND';end if;
 if project.id is not null and project.project_code<>p_snapshot->>'projectCode' then raise exception 'E_PROJECT_CODE_CONFLICT';end if;
 select * into prior from public.tashan_project_versions where id=p_snapshot->>'id';
 if found then
  if prior.project_id<>p_snapshot->>'projectId' or prior.fingerprint<>p_snapshot->>'fingerprint' then raise exception 'E_VERSION_CONFLICT';end if;
  return jsonb_build_object('ready',prior.ready,'created',false);
 end if;
 if exists(select 1 from public.tashan_projects where project_code=p_snapshot->>'projectCode' and id<>p_snapshot->>'projectId')then raise exception 'E_PROJECT_CODE_CONFLICT';end if;
 if exists(select 1 from public.tashan_project_versions where project_id=p_snapshot->>'projectId' and number=(p_snapshot->>'number')::integer)then raise exception 'E_VERSION_NUMBER_CONFLICT';end if;
 if project.id is null and(select count(*) from public.tashan_projects where owner_id=p_actor)>=100 then raise exception 'E_PROJECT_LIMIT';end if;
 if(select count(*) from public.tashan_project_versions where project_id=p_snapshot->>'projectId')>=100 then raise exception 'E_VERSION_LIMIT';end if;
 metadata_size:=octet_length((p_snapshot-'fingerprint')::text);
 if metadata_size>1048576 then raise exception 'E_INVALID_INPUT';end if;
 for file in select key,value from jsonb_each(p_snapshot->'files')loop
  if file.key not in('attachment','coverFile') or (file.value->>'size')::bigint<0 or (file.value->>'size')::bigint>(case when file.key='coverFile' then 5242880 else 20971520 end) then raise exception 'E_INVALID_INPUT';end if;
  if not(file.value->>'sha256'=any(seen)) and not exists(select 1 from public.tashan_project_assets where owner_id=p_actor and sha256=file.value->>'sha256')then extra:=extra+(file.value->>'size')::bigint;seen:=array_append(seen,file.value->>'sha256');end if;
 end loop;
 select coalesce(sum(size),0) into used from public.tashan_project_assets where owner_id=p_actor;
 used:=used+coalesce((select sum(octet_length(v.metadata::text)+octet_length(v.source_references::text)+octet_length(v.files::text)+octet_length(v.note)) from public.tashan_project_versions v join public.tashan_projects p on p.id=v.project_id where p.owner_id=p_actor),0);
 if used+extra+metadata_size>209715200 then raise exception 'E_STORAGE_QUOTA';end if;
 if project.id is null then insert into public.tashan_projects(id,owner_id,project_code)values(p_snapshot->>'projectId',p_actor,p_snapshot->>'projectCode');end if;
 for file in select key,value from jsonb_each(p_snapshot->'files')loop
  insert into public.tashan_project_assets(id,owner_id,sha256,size)values(p_actor::text||'/'||(file.value->>'sha256'),p_actor,file.value->>'sha256',(file.value->>'size')::bigint)on conflict(owner_id,sha256)do nothing;
 end loop;
 insert into public.tashan_project_versions(id,project_id,number,created_at,note,source_references,metadata,files,fingerprint)
 values(p_snapshot->>'id',p_snapshot->>'projectId',(p_snapshot->>'number')::integer,(p_snapshot->>'createdAt')::timestamptz,coalesce(p_snapshot->>'note',''),p_snapshot->'sourceReferences',p_snapshot->'metadata',p_snapshot->'files',p_snapshot->>'fingerprint');
 return jsonb_build_object('ready',false,'created',true);
end;$$;

create function public.tashan_project_commit(p_actor uuid,p_id text,p_version text,p_fingerprint text) returns jsonb language plpgsql security definer set search_path='' as $$
declare version public.tashan_project_versions;file record;was_ready boolean;
begin
 perform pg_catalog.pg_advisory_xact_lock(77339103);perform public.tashan_project_actor(p_actor);
 if not exists(select 1 from public.tashan_projects where id=p_id and owner_id=p_actor)then raise exception 'E_PROJECT_NOT_FOUND';end if;
 select * into version from public.tashan_project_versions where id=p_version and project_id=p_id for update;
 if not found then raise exception 'E_PROJECT_NOT_FOUND';end if;
 if version.fingerprint<>p_fingerprint then raise exception 'E_VERSION_CONFLICT';end if;
 was_ready:=version.ready;
 for file in select value from jsonb_each(version.files)loop
  if not exists(select 1 from storage.objects where bucket_id='tashan-projects' and name=p_actor::text||'/'||(file.value->>'sha256'))then raise exception 'E_PROJECT_FILE_MISSING';end if;
 end loop;
 if not was_ready then
  update public.tashan_project_versions set ready=true where id=p_version;
  update public.tashan_projects set updated_at=clock_timestamp()where id=p_id;
  insert into public.tashan_account_audit(actor_id,action,details)values(p_actor,'project.version_saved',jsonb_build_object('projectId',p_id,'versionId',p_version));
 end if;
 return public.tashan_project_version(p_actor,p_id,p_version,false)||jsonb_build_object('created',not was_ready);
end;$$;

create function public.tashan_project_publish(p_actor uuid,p_id text,p_version text,p_expected text) returns jsonb language plpgsql security definer set search_path='' as $$
declare project public.tashan_projects;
begin
 perform pg_catalog.pg_advisory_xact_lock(77339103);perform public.tashan_project_actor(p_actor);
 select * into project from public.tashan_projects where id=p_id and owner_id=p_actor for update;
 if not found then raise exception 'E_PROJECT_NOT_FOUND';end if;
 if project.published_version_id is distinct from p_expected then
  if project.published_version_id=p_version then return public.tashan_project_summary(p_id,false);end if;
  raise exception 'E_PUBLICATION_CONFLICT';
 end if;
 if not exists(select 1 from public.tashan_project_versions where id=p_version and project_id=p_id and ready)then raise exception 'E_PROJECT_NOT_FOUND';end if;
 update public.tashan_projects set published_version_id=p_version,updated_at=clock_timestamp()where id=p_id;
 insert into public.tashan_account_audit(actor_id,action,details)values(p_actor,'project.published',jsonb_build_object('projectId',p_id,'versionId',p_version));
 return public.tashan_project_summary(p_id,false);
end;$$;

create function public.tashan_project_unpublish(p_actor uuid,p_id text,p_expected text) returns jsonb language plpgsql security definer set search_path='' as $$
declare project public.tashan_projects;
begin
 perform pg_catalog.pg_advisory_xact_lock(77339103);perform public.tashan_project_actor(p_actor);
 select * into project from public.tashan_projects where id=p_id and owner_id=p_actor for update;
 if not found then raise exception 'E_PROJECT_NOT_FOUND';end if;
 if project.published_version_id is null then return public.tashan_project_summary(p_id,false);end if;
 if project.published_version_id is distinct from p_expected then raise exception 'E_PUBLICATION_CONFLICT';end if;
 update public.tashan_projects set published_version_id=null,updated_at=clock_timestamp()where id=p_id;
 insert into public.tashan_account_audit(actor_id,action,details)values(p_actor,'project.unpublished',jsonb_build_object('projectId',p_id,'versionId',p_expected));
 return public.tashan_project_summary(p_id,false);
end;$$;

create function public.tashan_project_file(p_actor uuid,p_id text,p_version text,p_field text,p_public boolean default false) returns jsonb language plpgsql security definer set search_path='' as $$
declare snapshot jsonb;file jsonb;owner uuid;
begin
 snapshot:=public.tashan_project_version(p_actor,p_id,p_version,p_public);
 if p_field not in('attachment','coverFile')then raise exception 'E_PROJECT_NOT_FOUND';end if;
 file:=snapshot->'version'->'files'->p_field;
 if file is null then raise exception 'E_PROJECT_NOT_FOUND';end if;
 select owner_id into owner from public.tashan_projects where id=p_id;
 return file||jsonb_build_object('objectKey',owner::text||'/'||(file->>'sha256'));
end;$$;

-- Use exact signatures so other applications' functions and overloads are untouched.
do $$declare signature regprocedure;begin
 foreach signature in array array[
  'public.tashan_project_actor(uuid)'::regprocedure,
  'public.tashan_project_summary(text,boolean)'::regprocedure,
  'public.tashan_project_list(uuid,integer)'::regprocedure,
  'public.tashan_project_get(uuid,text,boolean)'::regprocedure,
  'public.tashan_project_published(integer)'::regprocedure,
  'public.tashan_project_version(uuid,text,text,boolean)'::regprocedure,
  'public.tashan_project_versions(uuid,text)'::regprocedure,
  'public.tashan_project_prepare(uuid,jsonb)'::regprocedure,
  'public.tashan_project_commit(uuid,text,text,text)'::regprocedure,
  'public.tashan_project_publish(uuid,text,text,text)'::regprocedure,
  'public.tashan_project_unpublish(uuid,text,text)'::regprocedure,
  'public.tashan_project_file(uuid,text,text,text,boolean)'::regprocedure
 ]loop
  execute format('revoke all on function %s from public,anon,authenticated',signature);
  execute format('grant execute on function %s to service_role',signature);
 end loop;
end$$;
