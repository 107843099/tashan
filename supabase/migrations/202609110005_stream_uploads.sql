-- R2 upload receipts attest bytes verified by the server-side R2 binding, never
-- client-supplied hashes alone. Old Supabase versions keep their original backend.
-- This one-time increment does not create, move or modify any Storage/R2 object.
alter table public.tashan_project_versions add column storage_backend text not null default 'supabase' check(storage_backend in('supabase','r2'));

create table public.tashan_project_upload_receipts (
 version_id text not null references public.tashan_project_versions(id) on delete cascade,
 field text not null check(field in('attachment','coverFile')),
 fingerprint text not null check(fingerprint ~ '^[a-f0-9]{64}$'),
 sha256 text not null check(sha256 ~ '^[a-f0-9]{64}$'),
 size bigint not null check(size>=0),
 object_version text not null check(length(object_version) between 1 and 256),
 image_type text check(image_type in('image/png','image/jpeg','image/gif','image/webp')),
 verified_at timestamptz not null default now(),
 primary key(version_id,field)
);
alter table public.tashan_project_upload_receipts enable row level security;
revoke all on public.tashan_project_upload_receipts from public,anon,authenticated;
grant select,insert,update,delete on public.tashan_project_upload_receipts to service_role;

-- Shared reservation checks are service-only. The assets table reserves logical
-- quota; it is not evidence that any corresponding object has been uploaded.
create function public.tashan_project_reserve_upload(p_actor uuid,p_snapshot jsonb,p_backend text) returns jsonb language plpgsql security definer set search_path='' as $$
declare project public.tashan_projects;prior public.tashan_project_versions;file record;used bigint;extra bigint:=0;metadata_size bigint;seen jsonb:='{}';existing_size bigint;file_size bigint;file_sha text;
begin
 perform pg_catalog.pg_advisory_xact_lock(77339103);
 perform public.tashan_project_actor(p_actor);
 if p_backend is null or p_backend not in('supabase','r2') or jsonb_typeof(p_snapshot) is distinct from 'object'
    or coalesce(p_snapshot->>'fingerprint','') !~ '^[a-f0-9]{64}$'
    or coalesce(p_snapshot->>'projectId','') !~ '^local-[A-Za-z0-9][A-Za-z0-9_-]{0,95}$'
    or coalesce(p_snapshot->>'id','') !~ '^version-[A-Za-z0-9][A-Za-z0-9_-]{0,91}$'
    or coalesce(p_snapshot->>'projectCode','') !~ '^TS-L-[A-F0-9]{16}$'
    or coalesce(p_snapshot->>'number','') !~ '^[1-9][0-9]{0,6}$'
    or (p_snapshot->>'number')::bigint>1000000
    or jsonb_typeof(p_snapshot->'metadata') is distinct from 'object'
    or jsonb_typeof(p_snapshot->'sourceReferences') is distinct from 'array'
    or jsonb_typeof(p_snapshot->'files') is distinct from 'object'
    or p_snapshot->>'createdAt' is null then raise exception 'E_INVALID_INPUT';end if;
 if (p_snapshot->>'createdAt')::timestamptz is null then raise exception 'E_INVALID_INPUT';end if;
 metadata_size:=octet_length((p_snapshot-'fingerprint')::text);
 if metadata_size>1048576 then raise exception 'E_INVALID_INPUT';end if;
 select * into project from public.tashan_projects where id=p_snapshot->>'projectId';
 if found and project.owner_id<>p_actor then raise exception 'E_PROJECT_NOT_FOUND';end if;
 if project.id is not null and project.project_code<>p_snapshot->>'projectCode' then raise exception 'E_PROJECT_CODE_CONFLICT';end if;
 select * into prior from public.tashan_project_versions where id=p_snapshot->>'id';
 if found then
  if prior.project_id<>p_snapshot->>'projectId' or prior.fingerprint<>p_snapshot->>'fingerprint'
     or prior.number<>(p_snapshot->>'number')::integer or prior.created_at<>(p_snapshot->>'createdAt')::timestamptz
     or prior.note<>coalesce(p_snapshot->>'note','') or prior.metadata is distinct from p_snapshot->'metadata'
     or prior.source_references is distinct from p_snapshot->'sourceReferences' or prior.files is distinct from p_snapshot->'files' then raise exception 'E_VERSION_CONFLICT';end if;
  -- Existing legacy snapshots, including former 20 MiB attachments, remain
  -- readable. Neither protocol takes over the other's in-flight reservation.
  if prior.storage_backend<>p_backend and not(p_backend='r2' and prior.storage_backend='supabase' and prior.ready) then raise exception 'E_UPLOAD_PROTOCOL_CONFLICT';end if;
  return jsonb_build_object('ready',prior.ready,'created',false,'storageBackend',prior.storage_backend,'fingerprint',prior.fingerprint);
 end if;
 -- Validate every new file before reserving quota or deduplicating hashes.
 for file in select key,value from jsonb_each(p_snapshot->'files')loop
  if file.key not in('attachment','coverFile') or jsonb_typeof(file.value) is distinct from 'object'
     or exists(select 1 from jsonb_object_keys(file.value) key where key not in('name','type','size','sha256'))
     or coalesce(file.value->>'sha256','') !~ '^[a-f0-9]{64}$'
     or coalesce(file.value->>'size','') !~ '^[0-9]{1,10}$'
     or jsonb_typeof(file.value->'size') is distinct from 'number'
     or jsonb_typeof(file.value->'name') is distinct from 'string'
     or length(file.value->>'name') not between 1 and 255
     or file.value->>'name' ~ '[\\/[:cntrl:]]'
     or jsonb_typeof(file.value->'type') is distinct from 'string' then raise exception 'E_INVALID_INPUT';end if;
  file_size:=(file.value->>'size')::bigint;file_sha:=file.value->>'sha256';
  if file_size>(case when file.key='coverFile' then 5242880 else 10485760 end)
     or file.value->>'type' not in('text/html','application/zip','text/markdown','text/plain','application/json','application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.openxmlformats-officedocument.presentationml.presentation','image/png','image/jpeg','image/webp','image/gif')
     or (file.key='coverFile' and file.value->>'type' not in('image/png','image/jpeg','image/webp','image/gif')) then raise exception 'E_INVALID_INPUT';end if;
  if seen ? file_sha and (seen->>file_sha)::bigint<>file_size then raise exception 'E_ASSET_SIZE_CONFLICT';end if;
  seen:=seen||jsonb_build_object(file_sha,file_size);
  select size into existing_size from public.tashan_project_assets where owner_id=p_actor and sha256=file_sha;
  if found and existing_size<>file_size then raise exception 'E_ASSET_SIZE_CONFLICT';end if;
 end loop;
 if exists(select 1 from public.tashan_projects where project_code=p_snapshot->>'projectCode' and id<>p_snapshot->>'projectId')then raise exception 'E_PROJECT_CODE_CONFLICT';end if;
 if exists(select 1 from public.tashan_project_versions where project_id=p_snapshot->>'projectId' and number=(p_snapshot->>'number')::integer)then raise exception 'E_VERSION_NUMBER_CONFLICT';end if;
 if project.id is null and(select count(*) from public.tashan_projects where owner_id=p_actor)>=100 then raise exception 'E_PROJECT_LIMIT';end if;
 if(select count(*) from public.tashan_project_versions where project_id=p_snapshot->>'projectId')>=100 then raise exception 'E_VERSION_LIMIT';end if;
 for file in select key,value from jsonb_each(seen)loop
  if not exists(select 1 from public.tashan_project_assets where owner_id=p_actor and sha256=file.key)then extra:=extra+(file.value#>>'{}')::bigint;end if;
 end loop;
 select coalesce(sum(size),0) into used from public.tashan_project_assets where owner_id=p_actor;
 used:=used+coalesce((select sum(octet_length(v.metadata::text)+octet_length(v.source_references::text)+octet_length(v.files::text)+octet_length(v.note)) from public.tashan_project_versions v join public.tashan_projects p on p.id=v.project_id where p.owner_id=p_actor),0);
 if used+extra+metadata_size>209715200 then raise exception 'E_STORAGE_QUOTA';end if;
 if project.id is null then insert into public.tashan_projects(id,owner_id,project_code)values(p_snapshot->>'projectId',p_actor,p_snapshot->>'projectCode');end if;
 for file in select key,value from jsonb_each(seen)loop
  insert into public.tashan_project_assets(id,owner_id,sha256,size)values(p_actor::text||'/'||file.key,p_actor,file.key,(file.value#>>'{}')::bigint)on conflict(owner_id,sha256)do nothing;
 end loop;
 insert into public.tashan_project_versions(id,project_id,number,created_at,note,source_references,metadata,files,fingerprint,storage_backend)
 values(p_snapshot->>'id',p_snapshot->>'projectId',(p_snapshot->>'number')::integer,(p_snapshot->>'createdAt')::timestamptz,coalesce(p_snapshot->>'note',''),p_snapshot->'sourceReferences',p_snapshot->'metadata',p_snapshot->'files',p_snapshot->>'fingerprint',p_backend);
 return jsonb_build_object('ready',false,'created',true,'storageBackend',p_backend,'fingerprint',p_snapshot->>'fingerprint');
end;$$;

-- Keep the exact legacy RPC identity and grants. Legacy commits remain backed
-- by Supabase Storage and cannot be used to finalize an R2 reservation.
create or replace function public.tashan_project_prepare(p_actor uuid,p_snapshot jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
begin return public.tashan_project_reserve_upload(p_actor,p_snapshot,'supabase');end;$$;

create function public.tashan_project_prepare_r2(p_actor uuid,p_snapshot jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;files jsonb;
begin
 result:=public.tashan_project_reserve_upload(p_actor,p_snapshot,'r2');
 select coalesce(jsonb_object_agg(f.key,f.value||jsonb_build_object('verified',case when result->>'storageBackend'='supabase' then (result->>'ready')::boolean else r.version_id is not null end,'objectVersion',r.object_version)),'{}')
 into files from jsonb_each(p_snapshot->'files') f left join public.tashan_project_upload_receipts r on r.version_id=p_snapshot->>'id' and r.field=f.key;
 return result||jsonb_build_object('files',files);
end;$$;

create function public.tashan_project_upload_file(p_actor uuid,p_id text,p_version text,p_field text,p_fingerprint text) returns jsonb language plpgsql security definer set search_path='' as $$
declare version public.tashan_project_versions;file jsonb;receipt public.tashan_project_upload_receipts;
begin
 perform public.tashan_project_actor(p_actor);
 if not exists(select 1 from public.tashan_projects where id=p_id and owner_id=p_actor)then raise exception 'E_PROJECT_NOT_FOUND';end if;
 select * into version from public.tashan_project_versions where id=p_version and project_id=p_id;
 if not found then raise exception 'E_PROJECT_NOT_FOUND';end if;
 if version.storage_backend<>'r2' then raise exception 'E_UPLOAD_PROTOCOL_CONFLICT';end if;
 if p_fingerprint is null or version.fingerprint<>p_fingerprint then raise exception 'E_VERSION_CONFLICT';end if;
 if p_field is null or p_field not in('attachment','coverFile') then raise exception 'E_PROJECT_NOT_FOUND';end if;
 file:=version.files->p_field;if file is null then raise exception 'E_PROJECT_NOT_FOUND';end if;
 select * into receipt from public.tashan_project_upload_receipts where version_id=p_version and field=p_field;
 return file||jsonb_build_object('objectKey',p_actor::text||'/'||(file->>'sha256'),'storageBackend','r2','verified',receipt.version_id is not null,'objectVersion',receipt.object_version);
end;$$;

-- The Worker calls this only AFTER R2 checked the supplied SHA-256 against the
-- complete raw stream, FixedLengthStream enforced the exact size, and the stored
-- object/version/checksum and image magic (for covers) were verified. A browser
-- cannot call this RPC or submit a receipt via prepare/commit.
create function public.tashan_project_mark_verified(p_actor uuid,p_id text,p_version text,p_field text,p_fingerprint text,p_sha256 text,p_size bigint,p_object_version text,p_image_type text default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare descriptor jsonb;version public.tashan_project_versions;receipt public.tashan_project_upload_receipts;
begin
 perform pg_catalog.pg_advisory_xact_lock(77339103);
 descriptor:=public.tashan_project_upload_file(p_actor,p_id,p_version,p_field,p_fingerprint);
 select * into version from public.tashan_project_versions where id=p_version for update;
 if p_sha256 is null or p_sha256<>descriptor->>'sha256' or p_size is null or p_size<>(descriptor->>'size')::bigint
    or p_object_version is null or length(p_object_version) not between 1 and 256 or p_object_version ~ '[[:cntrl:]]'
    or (p_image_type is not null and p_image_type not in('image/png','image/jpeg','image/gif','image/webp'))
    or (p_field='coverFile' and (p_image_type is null or p_image_type<>descriptor->>'type')) then raise exception 'E_UPLOAD_VERIFICATION_FAILED';end if;
 select * into receipt from public.tashan_project_upload_receipts where version_id=p_version and field=p_field;
 if found then
  if receipt.fingerprint<>p_fingerprint or receipt.sha256<>p_sha256 or receipt.size<>p_size or receipt.object_version<>p_object_version or receipt.image_type is distinct from p_image_type then raise exception 'E_UPLOAD_VERIFICATION_CONFLICT';end if;
  return descriptor;
 end if;
 if version.ready then raise exception 'E_UPLOAD_VERIFICATION_CONFLICT';end if;
 insert into public.tashan_project_upload_receipts(version_id,field,fingerprint,sha256,size,object_version,image_type)
 values(p_version,p_field,p_fingerprint,p_sha256,p_size,p_object_version,p_image_type);
 return public.tashan_project_upload_file(p_actor,p_id,p_version,p_field,p_fingerprint);
end;$$;

create function public.tashan_project_commit_r2(p_actor uuid,p_id text,p_version text,p_fingerprint text) returns jsonb language plpgsql security definer set search_path='' as $$
declare version public.tashan_project_versions;file record;was_ready boolean;
begin
 perform pg_catalog.pg_advisory_xact_lock(77339103);perform public.tashan_project_actor(p_actor);
 if not exists(select 1 from public.tashan_projects where id=p_id and owner_id=p_actor)then raise exception 'E_PROJECT_NOT_FOUND';end if;
 select * into version from public.tashan_project_versions where id=p_version and project_id=p_id for update;
 if not found then raise exception 'E_PROJECT_NOT_FOUND';end if;
 if p_fingerprint is null or version.fingerprint<>p_fingerprint then raise exception 'E_VERSION_CONFLICT';end if;
 if version.storage_backend='supabase' and version.ready then
  return public.tashan_project_version(p_actor,p_id,p_version,false)||jsonb_build_object('created',false);
 end if;
 if version.storage_backend<>'r2' then raise exception 'E_UPLOAD_PROTOCOL_CONFLICT';end if;
 was_ready:=version.ready;
 for file in select key,value from jsonb_each(version.files)loop
  if not exists(select 1 from public.tashan_project_upload_receipts r where r.version_id=p_version and r.field=file.key and r.fingerprint=version.fingerprint and r.sha256=file.value->>'sha256' and r.size=(file.value->>'size')::bigint and (file.key<>'coverFile' or r.image_type=file.value->>'type'))then raise exception 'E_PROJECT_FILE_MISSING';end if;
 end loop;
 if not was_ready then
  update public.tashan_project_versions set ready=true where id=p_version;
  update public.tashan_projects set updated_at=clock_timestamp()where id=p_id;
  insert into public.tashan_account_audit(actor_id,action,details)values(p_actor,'project.version_saved',jsonb_build_object('projectId',p_id,'versionId',p_version));
 end if;
 return public.tashan_project_version(p_actor,p_id,p_version,false)||jsonb_build_object('created',not was_ready);
end;$$;

create or replace function public.tashan_project_commit(p_actor uuid,p_id text,p_version text,p_fingerprint text) returns jsonb language plpgsql security definer set search_path='' as $$
declare version public.tashan_project_versions;file record;was_ready boolean;
begin
 perform pg_catalog.pg_advisory_xact_lock(77339103);perform public.tashan_project_actor(p_actor);
 if not exists(select 1 from public.tashan_projects where id=p_id and owner_id=p_actor)then raise exception 'E_PROJECT_NOT_FOUND';end if;
 select * into version from public.tashan_project_versions where id=p_version and project_id=p_id for update;
 if not found then raise exception 'E_PROJECT_NOT_FOUND';end if;
 if version.storage_backend<>'supabase' then raise exception 'E_UPLOAD_PROTOCOL_CONFLICT';end if;
 if p_fingerprint is null or version.fingerprint<>p_fingerprint then raise exception 'E_VERSION_CONFLICT';end if;
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

create or replace function public.tashan_project_file(p_actor uuid,p_id text,p_version text,p_field text,p_public boolean default false) returns jsonb language plpgsql security definer set search_path='' as $$
declare snapshot jsonb;file jsonb;owner uuid;backend text;receipt public.tashan_project_upload_receipts;
begin
 snapshot:=public.tashan_project_version(p_actor,p_id,p_version,p_public);
 if p_field is null or p_field not in('attachment','coverFile')then raise exception 'E_PROJECT_NOT_FOUND';end if;
 file:=snapshot->'version'->'files'->p_field;
 if file is null then raise exception 'E_PROJECT_NOT_FOUND';end if;
 select owner_id into owner from public.tashan_projects where id=p_id;
 select storage_backend into backend from public.tashan_project_versions where id=p_version and project_id=p_id;
 if backend='r2' then
  select * into receipt from public.tashan_project_upload_receipts where version_id=p_version and field=p_field;
  if not found or receipt.sha256<>file->>'sha256' or receipt.size<>(file->>'size')::bigint then raise exception 'E_PROJECT_FILE_MISSING';end if;
 end if;
 return file||jsonb_build_object('objectKey',owner::text||'/'||(file->>'sha256'),'storageBackend',backend,'objectVersion',receipt.object_version);
end;$$;

-- Exact signatures preserve other applications' functions and overloads.
do $$declare signature regprocedure;begin
 foreach signature in array array[
  'public.tashan_project_reserve_upload(uuid,jsonb,text)'::regprocedure,
  'public.tashan_project_prepare(uuid,jsonb)'::regprocedure,
  'public.tashan_project_prepare_r2(uuid,jsonb)'::regprocedure,
  'public.tashan_project_upload_file(uuid,text,text,text,text)'::regprocedure,
  'public.tashan_project_mark_verified(uuid,text,text,text,text,text,bigint,text,text)'::regprocedure,
  'public.tashan_project_commit_r2(uuid,text,text,text)'::regprocedure,
  'public.tashan_project_commit(uuid,text,text,text)'::regprocedure,
  'public.tashan_project_file(uuid,text,text,text,boolean)'::regprocedure
 ]loop
  execute format('revoke all on function %s from public,anon,authenticated',signature);
  execute format('grant execute on function %s to service_role',signature);
 end loop;
end$$;
