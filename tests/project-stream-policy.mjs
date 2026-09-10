import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';

// A real, isolated PostgreSQL engine: no network, configured account or R2 access.
// The Worker separately tests actual R2 digest/length/magic checks; these tests
// establish that only its service credential can attest a matching receipt.
test('005 preserves legacy uploads and makes R2 visibility depend on immutable verified receipts', {skip:!process.env.PGLITE_MODULE},async t=>{
  const {PGlite}=await import(process.env.PGLITE_MODULE),db=new PGlite();
  const sha=value=>createHash('sha256').update(String(value)).digest('hex');
  const uuid=number=>'20000000-0000-4000-8000-'+number.toString(16).padStart(12,'0');
  const migration=name=>readFile(new URL('../supabase/migrations/'+name,import.meta.url),'utf8');
  const rpc=async(name,args,casts)=> (await db.query('select public.'+name+'('+args.map((_,i)=>'$'+(i+1)+(casts?.[i]?'::'+casts[i]:'')).join(',')+') as result',args)).rows[0].result;
  const file=(label,size=12,type='text/html')=>({name:label+(type==='image/png'?'.png':'.html'),size,type,sha256:sha(label)});
  const snapshot=(label,files={},overrides={})=>{
    const value={projectId:'local-'+label,id:'version-'+label,projectCode:'TS-L-'+sha(label).slice(0,16).toUpperCase(),number:1,createdAt:'2026-09-11T00:00:00.000Z',note:'Synthetic receipt-policy fixture',sourceReferences:[],metadata:{title:label,kind:'runtime'},files,...overrides};
    return {...value,fingerprint:sha(JSON.stringify(value))};
  };
  const prepare=(actor,value,backend='r2')=>rpc(backend==='r2'?'tashan_project_prepare_r2':'tashan_project_prepare',[actor,value],['uuid','jsonb']);
  const commit=(actor,value,backend='r2',fingerprint=value.fingerprint)=>rpc(backend==='r2'?'tashan_project_commit_r2':'tashan_project_commit',[actor,value.projectId,value.id,fingerprint],['uuid','text','text','text']);
  const descriptor=(actor,value,field='attachment',fingerprint=value.fingerprint)=>rpc('tashan_project_upload_file',[actor,value.projectId,value.id,field,fingerprint],['uuid','text','text','text','text']);
  const verify=(actor,value,field='attachment',changes={})=>{
    const f=value.files[field],proof={fingerprint:value.fingerprint,sha256:f.sha256,size:f.size,objectVersion:'r2-object-'+f.sha256.slice(0,16),imageType:field==='coverFile'?f.type:null,...changes};
    return rpc('tashan_project_mark_verified',[actor,value.projectId,value.id,field,proof.fingerprint,proof.sha256,proof.size,proof.objectVersion,proof.imageType],['uuid','text','text','text','text','text','bigint','text','text']);
  };
  const getFile=(actor,value,field='attachment',isPublic=false)=>rpc('tashan_project_file',[actor,value.projectId,value.id,field,isPublic],['uuid','text','text','text','boolean']);
  const counts=async()=> (await db.query('select (select count(*)::integer from public.tashan_projects) projects,(select count(*)::integer from public.tashan_project_versions) versions,(select count(*)::integer from public.tashan_project_assets) assets,(select count(*)::integer from public.tashan_project_upload_receipts) receipts,(select count(*)::integer from public.tashan_account_audit) audits')).rows[0];
  const register=async(id,name,actor=null,bootstrap=false)=>{
    await db.query('insert into auth.users(id)values($1)',[id]);
    return rpc('tashan_register_account',[actor,id,name,name,bootstrap?'admin':'member',bootstrap],['uuid','uuid','text','text','text','boolean']);
  };
  let admin,member,other,legacyReady,legacyPending,r2;
  try{
    await db.exec('create role anon;create role authenticated;create role service_role;create schema auth;create schema storage;create table auth.users(id uuid primary key);create table auth.sessions(id uuid primary key,user_id uuid,created_at timestamptz);create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint);create table storage.objects(bucket_id text,name text);');
    await db.exec("create function public.tashan_project_commit(text) returns text language sql as 'select $1';create function public.unrelated_application() returns integer language sql as 'select 42';");
    for(const name of ['202609100001_accounts.sql','202609100002_projects.sql'])await db.exec(await migration(name));
    admin=await register(uuid(1),'admin',null,true);
    legacyReady=snapshot('legacy-ready',{attachment:file('legacy-ready',20*1024*1024)});
    legacyPending=snapshot('legacy-pending',{attachment:file('legacy-pending')});
    await prepare(admin.id,legacyReady,'supabase');await prepare(admin.id,legacyPending,'supabase');
    await db.query("insert into storage.objects(bucket_id,name) values('tashan-projects',$1)",[admin.id+'/'+legacyReady.files.attachment.sha256]);
    await commit(admin.id,legacyReady,'supabase');
    for(const name of ['202609100003_attachment_limit.sql','202609100004_account_onboarding.sql'])await db.exec(await migration(name));
    member=await register(uuid(2),'member',admin.id);other=await register(uuid(3),'other',admin.id);
    const changedFunctions=['tashan_project_prepare','tashan_project_commit','tashan_project_file'];
    const oldFunctions=async()=> (await db.query("select oid,proname,proargtypes::text,proacl,prosecdef,proconfig,case when proname=any($1::text[]) and pronargs>1 then null else prosrc end prosrc from pg_proc where pronamespace='public'::regnamespace order by oid",[changedFunctions])).rows;
    const beforeFunctions=await oldFunctions();
    const beforeStorage=(await db.query('select * from storage.objects order by name')).rows;
    const beforeAccounts=(await db.query('select * from public.tashan_accounts order by id')).rows;
    const beforeVersions=(await db.query('select * from public.tashan_project_versions order by id')).rows;
    await db.exec(await migration('202609110005_stream_uploads.sql'));

    await t.test('migration preserves account/security state, old snapshots, old function identities and Storage rows',async()=>{
      const existingIds=new Set(beforeFunctions.map(item=>item.oid));
      assert.deepEqual((await oldFunctions()).filter(item=>existingIds.has(item.oid)),beforeFunctions);
      assert.deepEqual((await db.query('select * from public.tashan_accounts order by id')).rows,beforeAccounts);
      assert.deepEqual((await db.query('select * from storage.objects order by name')).rows,beforeStorage);
      const after=(await db.query('select * from public.tashan_project_versions order by id')).rows;
      assert(after.every(row=>row.storage_backend==='supabase'));
      assert.deepEqual(after.map(({storage_backend,...row})=>row),beforeVersions);
      const legacy=await prepare(admin.id,legacyReady);
      assert.equal(legacy.ready,true);assert.equal(legacy.created,false);assert.equal(legacy.storageBackend,'supabase');assert.equal(legacy.files.attachment.verified,true);
      assert.equal((await commit(admin.id,legacyReady,'supabase')).created,false);
      const beforeRetry=await counts();assert.equal((await commit(admin.id,legacyReady)).created,false);assert.deepEqual(await counts(),beforeRetry);
      const oldFile=await getFile(admin.id,legacyReady);assert.equal(oldFile.storageBackend,'supabase');assert.equal(oldFile.objectVersion,null);assert.equal(oldFile.size,20*1024*1024);
      await assert.rejects(prepare(admin.id,legacyPending),/E_UPLOAD_PROTOCOL_CONFLICT/);
      await assert.rejects(commit(admin.id,legacyPending),/E_UPLOAD_PROTOCOL_CONFLICT/);
      assert.equal((await prepare(admin.id,legacyPending,'supabase')).ready,false);
      await db.query("insert into storage.objects(bucket_id,name)values('tashan-projects',$1)",[admin.id+'/'+legacyPending.files.attachment.sha256]);
      assert.equal((await commit(admin.id,legacyPending,'supabase')).created,true);
    });

    await t.test('a reservation, claimed hash and even a legacy Storage row cannot make an R2 version ready',async()=>{
      r2=snapshot('stream',{attachment:file('stream-content'),coverFile:file('stream-cover',24,'image/png')});
      const result=await prepare(member.id,r2);assert.equal(result.ready,false);assert.equal(result.created,true);assert.equal(result.storageBackend,'r2');assert.equal(result.fingerprint,r2.fingerprint);
      assert.equal(result.files.attachment.verified,false);assert.equal(result.files.coverFile.verified,false);
      assert.deepEqual(await descriptor(member.id,r2),{...r2.files.attachment,objectKey:member.id+'/'+r2.files.attachment.sha256,storageBackend:'r2',verified:false,objectVersion:null});
      await assert.rejects(getFile(member.id,r2),/E_PROJECT_NOT_FOUND/);
      await assert.rejects(commit(member.id,r2),/E_PROJECT_FILE_MISSING/);
      for(const f of Object.values(r2.files))await db.query("insert into storage.objects(bucket_id,name)values('tashan-projects',$1)",[member.id+'/'+f.sha256]);
      await assert.rejects(commit(member.id,r2),/E_PROJECT_FILE_MISSING/);
      await assert.rejects(commit(member.id,r2,'supabase'),/E_UPLOAD_PROTOCOL_CONFLICT/);
      await assert.rejects(prepare(member.id,r2,'supabase'),/E_UPLOAD_PROTOCOL_CONFLICT/);
      assert.equal((await counts()).receipts,0);
      assert.equal((await rpc('tashan_project_list',[member.id,1],['uuid','integer'])).total,0);
    });

    await t.test('wrong server proof, wrong fingerprint and invalid image signatures make no writes',async()=>{
      const before=await counts();
      for(const proof of [{sha256:sha('wrong')},{sha256:null},{size:13},{size:null},{objectVersion:null},{objectVersion:''},{objectVersion:'x'.repeat(257)},{objectVersion:'line\nbreak'},{imageType:'image/svg+xml'}])await assert.rejects(verify(member.id,r2,'attachment',proof),/E_UPLOAD_VERIFICATION_FAILED/);
      for(const proof of [{imageType:null},{imageType:'image/jpeg'},{imageType:'text/html'}])await assert.rejects(verify(member.id,r2,'coverFile',proof),/E_UPLOAD_VERIFICATION_FAILED/);
      for(const fingerprint of [null,'bad',sha('different')]){
        await assert.rejects(descriptor(member.id,r2,'attachment',fingerprint),/E_VERSION_CONFLICT/);
        await assert.rejects(verify(member.id,r2,'attachment',{fingerprint}),/E_VERSION_CONFLICT/);
        await assert.rejects(commit(member.id,r2,'r2',fingerprint),/E_VERSION_CONFLICT/);
      }
      for(const field of [null,'missing','__proto__'])await assert.rejects(descriptor(member.id,r2,field),/E_PROJECT_NOT_FOUND/);
      assert.deepEqual(await counts(),before);
    });

    await t.test('every new RPC enforces active owner, reset requirement and credential locks',async()=>{
      const operations=actor=>[()=>prepare(actor,r2),()=>descriptor(actor,r2),()=>verify(actor,r2),()=>commit(actor,r2)];
      for(const actor of [other.id,admin.id])for(const operation of operations(actor))await assert.rejects(operation(),/E_PROJECT_NOT_FOUND/,'Administrators do not own another member’s files');
      for(const operation of operations(null))await assert.rejects(operation(),/E_FORBIDDEN/);
      for(const mutation of ["status='disabled'","must_change_password=true","credential_lock='20000000-0000-4000-8000-000000000099',credential_lock_at=now()","credential_lock='20000000-0000-4000-8000-000000000099',credential_lock_at=null"]){
        await db.query('update public.tashan_accounts set '+mutation+' where id=$1',[member.id]);
        for(const operation of operations(member.id))await assert.rejects(operation(),/E_FORBIDDEN/);
        await db.query("update public.tashan_accounts set status='active',must_change_password=false,credential_lock=null,credential_lock_at=null where id=$1",[member.id]);
      }
    });

    await t.test('receipts are field-scoped, immutable and retries commit once',async()=>{
      const receipt=await verify(member.id,r2);assert.equal(receipt.verified,true);assert.match(receipt.objectVersion,/^r2-object-/);
      const before=await counts();assert.deepEqual(await verify(member.id,r2),receipt);assert.deepEqual(await counts(),before);
      await assert.rejects(verify(member.id,r2,'attachment',{objectVersion:'another-object-version'}),/E_UPLOAD_VERIFICATION_CONFLICT/);
      await assert.rejects(commit(member.id,r2),/E_PROJECT_FILE_MISSING/,'Attachment receipt cannot satisfy cover upload');
      const resumed=await prepare(member.id,r2);assert.equal(resumed.created,false);assert.equal(resumed.files.attachment.verified,true);assert.equal(resumed.files.coverFile.verified,false);
      await verify(member.id,r2,'coverFile');
      const commits=await Promise.all([commit(member.id,r2),commit(member.id,r2)]);
      assert.deepEqual(commits.map(value=>value.created).sort(),[false,true]);
      const audits=(await db.query("select count(*)::integer n from public.tashan_account_audit where action='project.version_saved' and details->>'versionId'=$1",[r2.id])).rows[0].n;assert.equal(audits,1);
      assert.equal((await prepare(member.id,r2)).ready,true);
      assert.equal((await getFile(member.id,r2)).objectVersion,receipt.objectVersion);
      assert.equal((await getFile(member.id,r2,'coverFile')).storageBackend,'r2');
      assert.equal((await rpc('tashan_project_list',[member.id,1],['uuid','integer'])).total,1);
      for(const changed of [{metadata:{title:'mutated'}},{files:{attachment:file('different')}},{sourceReferences:[{projectId:'local-changed'}]},{number:2},{note:'different'},{createdAt:'2026-09-12T00:00:00Z'},{fingerprint:sha('different')}])await assert.rejects(prepare(member.id,{...r2,...changed}),/E_VERSION_CONFLICT/);
      await assert.rejects(prepare(member.id,{...r2,projectCode:'TS-L-0000000000000000'}),/E_PROJECT_CODE_CONFLICT/);
      await assert.rejects(prepare(member.id,snapshot('same-number',{}, {projectId:r2.projectId,projectCode:r2.projectCode})),/E_VERSION_NUMBER_CONFLICT/);
    });

    await t.test('hash deduplication preserves size and requires a new receipt for each version and field',async()=>{
      const before=await counts();
      const shared=file('shared-image',32,'image/png');
      const contradictory=snapshot('contradictory',{attachment:shared,coverFile:{...shared,size:33}});
      await assert.rejects(prepare(member.id,contradictory),/E_ASSET_SIZE_CONFLICT/);assert.deepEqual(await counts(),before);
      const conflict=snapshot('existing-size-conflict',{attachment:{...r2.files.attachment,size:r2.files.attachment.size+1}});
      await assert.rejects(prepare(member.id,conflict),/E_ASSET_SIZE_CONFLICT/);assert.deepEqual(await counts(),before);
      const same=snapshot('same-image',{attachment:shared,coverFile:shared});await prepare(member.id,same);
      assert.equal((await counts()).assets,before.assets+1,'Same exact bytes reserve quota once');
      await verify(member.id,same);await assert.rejects(commit(member.id,same),/E_PROJECT_FILE_MISSING/);
      await verify(member.id,same,'coverFile');await commit(member.id,same);
      const next=snapshot('stream-v2',r2.files,{projectId:r2.projectId,projectCode:r2.projectCode,number:2});
      const beforeNext=await counts();const prepared=await prepare(member.id,next);assert.equal(prepared.files.attachment.verified,false);assert.equal((await counts()).assets,beforeNext.assets);
      await assert.rejects(commit(member.id,next),/E_PROJECT_FILE_MISSING/,'Global hash assets never stand in for a version receipt');
      await verify(member.id,next);await verify(member.id,next,'coverFile');await commit(member.id,next);
      // Hash namespaces are private: another owner has independent quota/receipts.
      const foreign=snapshot('other-owner',{attachment:r2.files.attachment});await prepare(other.id,foreign);
      assert.equal((await descriptor(other.id,foreign)).objectKey,other.id+'/'+r2.files.attachment.sha256);
      await assert.rejects(commit(other.id,foreign),/E_PROJECT_FILE_MISSING/);
    });

    await t.test('publication exposes only the explicitly selected ready version and respects withdrawal/owner disable',async()=>{
      await assert.rejects(getFile(null,r2,'attachment',true),/E_PROJECT_NOT_FOUND/);
      await rpc('tashan_project_publish',[member.id,r2.projectId,r2.id,null],['uuid','text','text','text']);
      assert.equal((await getFile(null,r2,'attachment',true)).storageBackend,'r2');
      const next={...r2,id:'version-stream-v2'};await assert.rejects(getFile(null,next,'attachment',true),/E_PROJECT_NOT_FOUND/);
      await db.query("update public.tashan_accounts set status='disabled' where id=$1",[member.id]);
      await assert.rejects(getFile(null,r2,'attachment',true),/E_PROJECT_NOT_FOUND/);
      await db.query("update public.tashan_accounts set status='active' where id=$1",[member.id]);
      await rpc('tashan_project_unpublish',[member.id,r2.projectId,r2.id],['uuid','text','text']);
      await assert.rejects(getFile(null,r2,'attachment',true),/E_PROJECT_NOT_FOUND/);
    });

    await t.test('small manifests enforce real-byte limits, reject forged receipt fields, and permit text-only prompts',async()=>{
      const limits=snapshot('exact-limits',{attachment:file('exact-attachment',10485760),coverFile:file('exact-cover',5242880,'image/png')});await prepare(member.id,limits);
      const before=await counts();
      for(const files of [
        {attachment:file('too-large',10485761)}, {coverFile:file('cover-too-large',5242881,'image/png')},
        {attachment:{...file('negative'),size:-1}}, {attachment:{...file('fraction'),size:0.5}}, {attachment:{...file('string-size'),size:'12'}},
        {attachment:{...file('bad-hash'),sha256:'client-chosen'}}, {attachment:{...file('path'),name:'../payload.html'}},
        {attachment:{...file('verified-field'),verified:true}}, {attachment:{...file('object-field'),objectVersion:'already-uploaded'}},
        {coverFile:file('svg',12,'image/svg+xml')}, {coverFile:file('wrong-type',12,'text/html')}, {unknown:file('unknown')}
      ])await assert.rejects(prepare(member.id,snapshot('invalid-'+sha(JSON.stringify(files)).slice(0,12),files)),/E_INVALID_INPUT/);
      assert.deepEqual(await counts(),before);
      for(const changes of [{fingerprint:null},{fingerprint:'not-a-hash'},{number:0},{number:1000001},{files:null},{sourceReferences:{}},{metadata:[]},{metadata:{body:'x'.repeat(1048576)}}])await assert.rejects(prepare(member.id,{...snapshot('invalid-manifest'),...changes}),/E_INVALID_INPUT/);
      assert.deepEqual(await counts(),before);
      const prompt=snapshot('text-prompt',{}, {metadata:{title:'Text-only prompt',kind:'prompt',prompt:'Synthetic classroom prompt'}});await prepare(member.id,prompt);
      assert.equal((await commit(member.id,prompt)).created,true);assert.equal((await commit(member.id,prompt)).created,false);
    });

    await t.test('quota failure rolls back metadata/assets and concurrent reservation retries are idempotent',async()=>{
      const owner=await register(uuid(4),'quota_owner',admin.id);
      await db.query('insert into public.tashan_project_assets(id,owner_id,sha256,size)values($1,$2,$3,$4)',[owner.id+'/'+sha('reserved'),owner.id,sha('reserved'),209715200-1024]);
      const before=await counts();
      await assert.rejects(prepare(owner.id,snapshot('quota-exceeded',{attachment:file('quota-file',2048)})),/E_STORAGE_QUOTA/);
      assert.deepEqual(await counts(),before,'Single transaction leaves no partial project, file reservation or version');
      const value=snapshot('parallel-reservation',{attachment:file('parallel')});
      const results=await Promise.all([prepare(member.id,value),prepare(member.id,value)]);
      assert.deepEqual(results.map(item=>item.created).sort(),[false,true]);
      assert.equal((await counts()).projects,before.projects+1);assert.equal((await counts()).versions,before.versions+1);assert.equal((await counts()).assets,before.assets+1);
      const receipts=await Promise.all([verify(member.id,value),verify(member.id,value)]);assert.deepEqual(receipts[0],receipts[1]);
      assert.equal((await counts()).receipts,before.receipts+1);
    });

    await t.test('new table and every exact RPC signature deny browser roles while service role remains callable',async()=>{
      const signatures=[
        ['tashan_project_reserve_upload',['uuid','jsonb','text'],[member.id,r2,'r2']],
        ['tashan_project_prepare_r2',['uuid','jsonb'],[member.id,r2]],
        ['tashan_project_upload_file',['uuid','text','text','text','text'],[member.id,r2.projectId,r2.id,'attachment',r2.fingerprint]],
        ['tashan_project_mark_verified',['uuid','text','text','text','text','text','bigint','text','text'],[member.id,r2.projectId,r2.id,'attachment',r2.fingerprint,r2.files.attachment.sha256,12,'object',null]],
        ['tashan_project_commit_r2',['uuid','text','text','text'],[member.id,r2.projectId,r2.id,r2.fingerprint]],
        ['tashan_project_prepare',['uuid','jsonb'],[admin.id,legacyReady]],
        ['tashan_project_commit',['uuid','text','text','text'],[admin.id,legacyReady.projectId,legacyReady.id,legacyReady.fingerprint]],
        ['tashan_project_file',['uuid','text','text','text','boolean'],[member.id,r2.projectId,r2.id,'attachment',false]]
      ];
      const table=(await db.query("select relrowsecurity from pg_class where oid='public.tashan_project_upload_receipts'::regclass")).rows[0];assert.equal(table.relrowsecurity,true);
      for(const [name,casts] of signatures){
        const signature='public.'+name+'('+casts.join(',')+')';
        const row=(await db.query("select prosecdef,proconfig,has_function_privilege('anon',oid,'EXECUTE') anon,has_function_privilege('authenticated',oid,'EXECUTE') authenticated,has_function_privilege('service_role',oid,'EXECUTE') service from pg_proc where oid=$1::regprocedure",[signature])).rows[0];
        assert.equal(row.prosecdef,true);assert.deepEqual(row.proconfig,['search_path=""']);assert.equal(row.anon,false);assert.equal(row.authenticated,false);assert.equal(row.service,true);
      }
      for(const role of ['anon','authenticated']){
        await db.exec('set role '+role);
        for(const [name,casts,args] of signatures)await assert.rejects(rpc(name,args,casts),/permission denied/);
        await assert.rejects(db.query('select * from public.tashan_project_upload_receipts'),/permission denied/);
        await assert.rejects(db.query("insert into public.tashan_project_upload_receipts(version_id,field,fingerprint,sha256,size,object_version)values($1,'attachment',$2,$3,12,'forged')",[r2.id,r2.fingerprint,r2.files.attachment.sha256]),/permission denied/);
        await db.exec('reset role');
      }
      await db.exec('set role service_role');assert.equal((await descriptor(member.id,r2)).verified,true);assert.equal((await commit(member.id,r2)).created,false);await db.exec('reset role');
    });
  }finally{await db.close();}
});
