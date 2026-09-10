import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFile} from 'node:fs/promises';

// Use a real in-memory PostgreSQL engine when available, never a configured cloud.
// PGLITE_MODULE points to an independently installed @electric-sql/pglite ESM file.
test('004 makes initial password change optional while preserving resets, locks, sessions and RPC permissions', {skip:!process.env.PGLITE_MODULE},async()=>{
  const {PGlite}=await import(process.env.PGLITE_MODULE),db=new PGlite();
  const migration=await readFile(new URL('../supabase/migrations/202609100004_account_onboarding.sql',import.meta.url),'utf8');
  const uuid=number=>'10000000-0000-4000-8000-'+number.toString(16).padStart(12,'0');
  let nextId=1;
  const rpc=async(name,args,casts)=>{
    const sql='select public.'+name+'('+args.map((_,index)=>'$'+(index+1)+(casts?.[index]?'::'+casts[index]:'')).join(',')+') as result';
    return (await db.query(sql,args)).rows[0].result;
  };
  const register=async(actor,name,role='member',bootstrap=false)=>{
    const id=uuid(nextId++);
    await db.query('insert into auth.users(id,encrypted_password) values($1,$2)',[id,'synthetic-unchanged-password-'+id]);
    return rpc('tashan_register_account',[actor,id,name,name,role,bootstrap],['uuid','uuid','text','text','text','boolean']);
  };
  const accounts=async()=> (await db.query('select * from public.tashan_accounts order by id')).rows;
  const account=id=>db.query('select * from public.tashan_accounts where id=$1',[id]).then(result=>result.rows[0]);
  const secureColumns=row=>({id:row.id,status:row.status,role:row.role,username:row.username,display_name:row.display_name,credentials_changed_at:row.credentials_changed_at,credential_lock:row.credential_lock,credential_lock_at:row.credential_lock_at,created_at:row.created_at});
  const exactSignature="'public.tashan_register_account(uuid,uuid,text,text,text,boolean)'::regprocedure";
  const securitySnapshot=async()=>({
    register:(await db.query(`select oid,proacl,prosecdef,proconfig from pg_proc where oid=${exactSignature}`)).rows,
    otherFunctions:(await db.query(`select oid,proacl,pg_get_functiondef(oid) as definition from pg_proc where pronamespace='public'::regnamespace and oid<>${exactSignature} order by oid`)).rows,
    tables:(await db.query("select oid,relacl,relrowsecurity,relforcerowsecurity from pg_class where relnamespace='public'::regnamespace and relkind in('r','S') order by oid")).rows,
    policies:(await db.query('select * from pg_policies order by schemaname,tablename,policyname')).rows
  });
  try{
    await db.exec('create role anon;create role authenticated;create role service_role;create schema auth;create table auth.users(id uuid primary key,encrypted_password text);create table auth.sessions(id uuid primary key,user_id uuid,created_at timestamptz);create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint);create table storage.objects(bucket_id text,name text);');
    await db.exec("create function public.tashan_register_account(text) returns text language sql as 'select $1';create function public.tashan_other_application() returns integer language sql as 'select 42';");
    for(const name of ['202609100001_accounts.sql','202609100002_projects.sql','202609100003_attachment_limit.sql'])await db.exec(await readFile(new URL('../supabase/migrations/'+name,import.meta.url),'utf8'));
    const admin=await register(null,'admin','admin',true);assert.equal(admin.must_change_password,false);
    const initial=await register(admin.id,'initial');
    const initialAdmin=await register(admin.id,'initial_admin','admin');
    const renamed=await register(admin.id,'renamed');
    await rpc('tashan_update_account',[admin.id,renamed.id,{displayName:'Renamed display'}],['uuid','uuid','jsonb']);
    const duplicate=await register(admin.id,'duplicate');
    await db.query("insert into public.tashan_account_audit(actor_id,target_id,action,details) select actor_id,target_id,action,details from public.tashan_account_audit where target_id=$1 and action='account_created'",[duplicate.id]);
    const noAudit=await register(admin.id,'no_audit');await db.query('delete from public.tashan_account_audit where target_id=$1',[noAudit.id]);
    const unknown=await register(admin.id,'unknown');await db.query("insert into public.tashan_account_audit(actor_id,target_id,action) values($1,$2,'unknown_credential_policy')",[admin.id,unknown.id]);
    const malformedUpdate=await register(admin.id,'malformed_update');await db.query("insert into public.tashan_account_audit(actor_id,target_id,action,details) values($1,$2,'account_updated','[]')",[admin.id,malformedUpdate.id]);
    const unknownUpdate=await register(admin.id,'unknown_update');await db.query("insert into public.tashan_account_audit(actor_id,target_id,action,details) values($1,$2,'account_updated','{\"mustChangePassword\":true}')",[admin.id,unknownUpdate.id]);
    const wrongAudit=await register(admin.id,'wrong_audit');await db.query("update public.tashan_account_audit set details=jsonb_build_object('username','someone_else','role','member') where target_id=$1",[wrongAudit.id]);
    const nullActor=await register(admin.id,'null_actor');await db.query('update public.tashan_account_audit set actor_id=null where target_id=$1',[nullActor.id]);
    const locked=await register(admin.id,'locked');
    const lock=await rpc('tashan_begin_password_change',[admin.id,locked.id,true],['uuid','uuid','boolean']);
    const staleLock=await register(admin.id,'stale_lock');await db.query("update public.tashan_accounts set credential_lock=$2,credential_lock_at=now()-interval '1 day' where id=$1",[staleLock.id,uuid(100)]);
    const missingLockTime=await register(admin.id,'missing_lock_time');await db.query('update public.tashan_accounts set credential_lock=$2 where id=$1',[missingLockTime.id,uuid(101)]);
    const orphanLockTime=await register(admin.id,'orphan_lock_time');await db.query('update public.tashan_accounts set credential_lock_at=now() where id=$1',[orphanLockTime.id]);
    const reset=await register(admin.id,'reset_admin','admin');
    const resetLock=await rpc('tashan_begin_password_change',[admin.id,reset.id,true],['uuid','uuid','boolean']);
    await rpc('tashan_finish_password_change',[reset.id,resetLock.lock,admin.id,true,true],['uuid','uuid','uuid','boolean','boolean']);
    const failedReset=await register(admin.id,'failed_reset');
    const failedLock=await rpc('tashan_begin_password_change',[admin.id,failedReset.id,true],['uuid','uuid','boolean']);
    await rpc('tashan_finish_password_change',[failedReset.id,failedLock.lock,admin.id,true,false],['uuid','uuid','uuid','boolean','boolean']);
    const resetAuditOnly=await register(admin.id,'reset_audit_only');await db.query("insert into public.tashan_account_audit(actor_id,target_id,action) values($1,$2,'password_reset')",[admin.id,resetAuditOnly.id]);
    const changedTimestamp=await register(admin.id,'changed_timestamp');await db.query("update public.tashan_accounts set credentials_changed_at='2025-01-01' where id=$1",[changedTimestamp.id]);
    const disabled=await register(admin.id,'disabled');await db.query("update public.tashan_accounts set status='disabled' where id=$1",[disabled.id]);
    const changed=await register(admin.id,'changed');
    const selfLock=await rpc('tashan_begin_password_change',[changed.id,changed.id,false],['uuid','uuid','boolean']);
    await rpc('tashan_finish_password_change',[changed.id,selfLock.lock,changed.id,false,true],['uuid','uuid','uuid','boolean','boolean']);
    const initialSession=uuid(201),resetSession=uuid(202),lockedSession=uuid(203);
    await db.query("insert into auth.sessions(id,user_id,created_at) values($1,$2,'2020-01-01'),($3,$4,'2020-01-01'),($5,$6,'2100-01-01')",[initialSession,initial.id,resetSession,reset.id,lockedSession,locked.id]);
    assert.equal((await rpc('tashan_session_account',[initial.id,initialSession],['uuid','uuid'])).must_change_password,true);
    assert.equal(await rpc('tashan_session_account',[reset.id,resetSession],['uuid','uuid']),null);
    assert.equal(await rpc('tashan_session_account',[locked.id,lockedSession],['uuid','uuid']),null);
    const before=await accounts(),securityBefore=await securitySnapshot(),authBefore=(await db.query('select * from auth.users order by id')).rows,sessionsBefore=(await db.query('select * from auth.sessions order by id')).rows;
    await db.exec(migration);
    assert.deepEqual(await securitySnapshot(),securityBefore,'Function identities, unrelated definitions, exact grants, table/sequence ACLs and RLS remain unchanged');
    assert.deepEqual((await db.query('select * from auth.users order by id')).rows,authBefore,'Migration never reads or replaces stored Auth passwords');
    assert.deepEqual((await db.query('select * from auth.sessions order by id')).rows,sessionsBefore,'Migration never creates or rewrites sessions');
    const after=await accounts();assert.deepEqual(after.map(secureColumns),before.map(secureColumns));
    const released=new Set([initial.id,initialAdmin.id,renamed.id]);
    for(const row of after){const prior=before.find(item=>item.id===row.id);assert.equal(row.must_change_password,released.has(row.id)?false:prior.must_change_password,row.username);}
    const policyAudit=(await db.query("select target_id,actor_id,details from public.tashan_account_audit where action='initial_password_requirement_removed' order by target_id")).rows;
    assert.deepEqual(policyAudit.map(row=>row.target_id),[...released].sort());
    assert(policyAudit.every(row=>row.actor_id===null&&row.details.migration==='202609100004'));
    assert.equal((await rpc('tashan_session_account',[initial.id,initialSession],['uuid','uuid'])).must_change_password,false,'Existing initial-login sessions now enter without changing password');
    assert.equal(await rpc('tashan_session_account',[reset.id,resetSession],['uuid','uuid']),null,'Reset-revoked sessions remain revoked');
    assert.equal(await rpc('tashan_session_account',[locked.id,lockedSession],['uuid','uuid']),null,'Active credential lock still blocks sessions');
    await assert.rejects(rpc('tashan_require_admin',[reset.id],['uuid']),/E_FORBIDDEN/,'Reset admins still must change password');
    await rpc('tashan_require_admin',[initialAdmin.id],['uuid']);
    const newMember=await register(admin.id,'new_member');const newAdmin=await register(admin.id,'new_admin','admin');
    assert.equal(newMember.must_change_password,false);assert.equal(newAdmin.must_change_password,false);await rpc('tashan_require_admin',[newAdmin.id],['uuid']);
    const directId=uuid(nextId++);await db.query('insert into auth.users(id) values($1)',[directId]);
    await db.query("insert into public.tashan_accounts(id,username,display_name) values($1,'direct_default','Direct')",[directId]);
    assert.equal((await account(directId)).must_change_password,false,'Column default also reflects the new initial-password policy');
    await assert.rejects(register(null,'second_bootstrap','admin',true),/E_BOOTSTRAP_CLOSED/);
    await assert.rejects(register(newMember.id,'not_an_admin'),/E_FORBIDDEN/);
    const newLock=await rpc('tashan_begin_password_change',[admin.id,newMember.id,true],['uuid','uuid','boolean']);
    assert.equal((await account(newMember.id)).must_change_password,true);
    await rpc('tashan_finish_password_change',[newMember.id,newLock.lock,admin.id,true,true],['uuid','uuid','uuid','boolean','boolean']);
    assert.equal((await account(newMember.id)).must_change_password,true,'Administrator resets after 004 still require a password change');
    const ownLock=await rpc('tashan_begin_password_change',[newMember.id,newMember.id,false],['uuid','uuid','boolean']);
    await rpc('tashan_finish_password_change',[newMember.id,ownLock.lock,newMember.id,false,true],['uuid','uuid','uuid','boolean','boolean']);
    assert.equal((await account(newMember.id)).must_change_password,false,'Members retain self-service password changes');
    await assert.rejects(rpc('tashan_finish_password_change',[locked.id,uuid(999),admin.id,true,true],['uuid','uuid','uuid','boolean','boolean']),/E_ACCOUNT_BUSY/,'Stale finalize tokens cannot release credential locks');
    assert.equal((await account(locked.id)).credential_lock,lock.lock);
    const beforeRerun=await accounts(),auditCount=(await db.query('select count(*)::integer n from public.tashan_account_audit')).rows[0].n;
    await db.exec(migration);
    assert.deepEqual(await accounts(),beforeRerun,'Reapplying 004 is a no-op for existing accounts');
    assert.equal((await db.query('select count(*)::integer n from public.tashan_account_audit')).rows[0].n,auditCount);
    for(const role of ['anon','authenticated']){
      await db.exec('set role '+role);
      await assert.rejects(rpc('tashan_register_account',[admin.id,uuid(900),'forbidden','Forbidden','member',false],['uuid','uuid','text','text','text','boolean']),/permission denied/);
      await assert.rejects(db.query('select * from public.tashan_accounts'),/permission denied/);
      await db.exec('reset role');
    }
    await db.exec('set role service_role');
    assert.equal((await rpc('tashan_session_account',[initial.id,initialSession],['uuid','uuid'])).must_change_password,false);
    await db.exec('reset role');
    // Fresh installations can bootstrap directly after the full policy migration.
    await db.exec('delete from public.tashan_account_audit;delete from public.tashan_accounts;delete from auth.sessions;delete from auth.users;');
    const fresh=await register(null,'fresh_admin','admin',true);assert.equal(fresh.must_change_password,false);
  }finally{await db.close();}
});
