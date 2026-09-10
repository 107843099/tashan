-- Reduce new project attachments to 10 MiB; covers remain 5 MiB and owner quota 200 MiB.
-- Existing objects and Storage bucket metadata are untouched. Update the private bucket
-- separately with the operator-only Storage API tool. CREATE OR REPLACE keeps the
-- function identity; explicit grants retain the service-role-only RPC boundary.
create or replace function public.tashan_project_prepare(p_actor uuid,p_snapshot jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
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
  if file.key not in('attachment','coverFile') or (file.value->>'size')::bigint<0 or (file.value->>'size')::bigint>(case when file.key='coverFile' then 5242880 else 10485760 end) then raise exception 'E_INVALID_INPUT';end if;
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

revoke all on function public.tashan_project_prepare(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.tashan_project_prepare(uuid,jsonb) to service_role;
