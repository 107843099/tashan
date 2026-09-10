import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import { strict as assert } from 'node:assert';
import { webcrypto } from 'node:crypto';

// Separate databases and serialized transactions model account scopes and atomic commits.
const clone = value => {
  if (!value || typeof value !== 'object' || value instanceof Blob) return value;
  if (Array.isArray(value)) return value.map(clone);
  const result = Object.create(Object.getPrototypeOf(value));
  for (const key of Object.keys(value)) result[key] = clone(value[key]);
  return result;
};
function memoryIndexedDB() {
  const databases = new Map();
  const control = { failAfter: -1, delay: 0 };
  return { control, databases, open(name) {
    if (!databases.has(name)) databases.set(name, { projects:new Map(), meta:new Map(), queue:[], running:false });
    const state = databases.get(name);
    const database = { objectStoreNames:{contains:()=>true},close(){},transaction(names,mode) {
      let working, pending=0, finished=false, started=false, writes=0;
      const waiting=[];
      const release = () => {state.running=false;const next=state.queue.shift();if(next)next();};
      const finish = () => {
        if(!started||pending||finished)return;
        finished=true;
        if(mode==='readwrite')for(const name of names)state[name]=working[name];
        tx.oncomplete?.();release();
      };
      const tx={error:null,abort() {
        if(finished)return;finished=true;
        setTimeout(()=>{tx.onabort?.();if(started)release();},0);
      },objectStore(name) {
        const request = operation => {
          const req={};pending++;
          const execute=()=>setTimeout(()=>{
            if(finished)return;
            try{req.result=operation();req.onsuccess?.();}
            catch(reason){tx.error=req.error=reason;tx.onerror?.({target:req});tx.abort();}
            pending--;finish();
          },control.delay);
          if(started)execute();else waiting.push(execute);
          return req;
        };
        return {
          getAll:()=>request(()=>Array.from(working[name].values(),clone)),
          get:key=>request(()=>clone(working[name].get(key))),
          put:value=>{const item=clone(value);return request(()=>{
            if(control.failAfter>=0&&writes++>=control.failAfter){const reason=new Error('Simulated quota failure');reason.name='QuotaExceededError';throw reason;}
            working[name].set(name==='projects'?item.id:item.key,item);
          });},
          delete:key=>request(()=>working[name].delete(key))
        };
      }};
      const start=()=>{
        if(finished){release();return;}
        state.running=true;started=true;
        working=Object.fromEntries(names.map(name=>[name,new Map(Array.from(state[name],([key,value])=>[key,clone(value)]))]));
        waiting.splice(0).forEach(operation=>operation());setTimeout(finish,0);
      };
      if(state.running)state.queue.push(start);else {state.running=true;setTimeout(start,0);}
      return tx;
    }};
    const request={result:database};setTimeout(()=>request.onsuccess?.(),0);return request;
  }};
}
const indexedDB=memoryIndexedDB();
let randomOverride;
const crypto={subtle:webcrypto.subtle,randomUUID:()=>webcrypto.randomUUID(),getRandomValues:array=>randomOverride?randomOverride(array):webcrypto.getRandomValues(array)};
const context=createContext({Blob,indexedDB,crypto,setTimeout,Uint8Array,Uint32Array,btoa:binary=>Buffer.from(binary,'binary').toString('base64'),atob:base64=>Buffer.from(base64,'base64').toString('binary')});
runInContext('window=globalThis',context);
runInContext(readFileSync('assets/js/storage.js','utf8'),context);
const store=context.PracticeStore;
const object=value=>{context.inputJSON=JSON.stringify(value);return runInContext('JSON.parse(inputJSON)',context);};
const json=value=>JSON.parse(JSON.stringify(value));
const file=(body,name='lesson.html',type='text/html')=>({...object({name,type}),blob:new Blob([body],{type})});
const record=(value,attachment='<h1>Lesson</h1>')=>{const item=object(value);if(attachment!==null)item.attachment=file(attachment);return item;};
const backupBlob=value=>new Blob([JSON.stringify(value)],{type:'application/json'});
const exportJSON=async()=>JSON.parse(await(await store.exportAll()).text());
const content=backup=>{const copy=json(backup);delete copy.exportedAt;return copy;};
const expectCode=code=>assert.match(code,/^TS-L-[A-F0-9]{16}$/);

// Existing guest data stays independent; optional legacy workspace fields are export-only.
const guest=await store.put(record({title:'Legacy guest'}));
await store.setScope('alpha');
assert.deepEqual(json(await store.getWorkspaceState()),{bookmarks:[],tasks:{},initialized:false});
assert.equal((await store.list()).length,0);
const guestBackup=JSON.parse(await(await store.exportGuest(object({workspace:{bookmarks:['earth'],tasks:{earth:{step:1}}}}))).text());
assert.equal(guestBackup.projects[0].id,guest.id);
assert.deepEqual(guestBackup.workspace,{bookmarks:['earth'],tasks:{earth:{step:1}}});
assert.equal(store.scope,'alpha');
assert.equal((await store.getWorkspaceState()).initialized,false,'Legacy export does not initialize the account workspace');

// Legacy codes migrate once, persist, and collision checking retries a repeated random value.
const state=indexedDB.databases.get('tashan-practice-library-account-alpha');
state.projects.set('local-seeded',object({id:'local-seeded',title:'Stable',projectCode:'TS-L-0000000100000002'}));
state.projects.set('local-old',object({id:'local-old',title:'Old without code'}));
let calls=0;
randomOverride=array=>{calls++;array.set(calls===1?[1,2]:[3,4]);return array;};
const migrated=await store.list();randomOverride=null;
assert.equal(calls,2,'Code generation retries a collision');
const oldCode=migrated.find(item=>item.id==='local-old').projectCode;expectCode(oldCode);
assert.equal((await store.get('local-old')).projectCode,oldCode);
await store.remove('local-old');await store.remove('local-seeded');

// Catalog content hashes are provenance versions, with null optional display fields normalized away.
await store.putDraft(object({title:'Catalog adaptation',sourceReferences:[{projectId:'earth',projectCode:'TS-0001',versionId:'catalog-'+ 'a'.repeat(32),versionNumber:null,title:'Earth'}]}));
assert.equal((await store.getDraft()).sourceReferences[0].versionId,'catalog-'+ 'a'.repeat(32));
assert(!('versionNumber' in (await store.getDraft()).sourceReferences[0]));
await store.putDraft(object({title:'Unversioned origin',sourceReferences:[{projectId:'local-old',versionId:null,versionNumber:null}]}));
assert(!('versionId' in (await store.getDraft()).sourceReferences[0]));
await store.clearDraft();

// Independent tabs merge mutations against authoritative IDB state instead of stale snapshots.
await Promise.all([
  store.updateWorkspaceState(object({toggleBookmark:'earth',taskUpserts:{earth:{step:1}}})),
  store.updateWorkspaceState(object({toggleBookmark:'poetry',taskUpserts:{poetry:{step:2}}}))
]);
const concurrentState=await store.getWorkspaceState();
assert.deepEqual([...concurrentState.bookmarks].sort(),['earth','poetry']);
assert.equal(concurrentState.tasks.earth.step,1);assert.equal(concurrentState.tasks.poetry.step,2);
await store.putWorkspaceState(object({bookmarks:[],tasks:{}}),{ifUninitialized:true});
assert.equal((await store.getWorkspaceState()).tasks.poetry.step,2,'Late migration never overwrites an initialized workspace');
await store.updateWorkspaceState(object({toggleBookmark:'earth',taskDeletes:['earth']}));
assert.deepEqual(json((await store.getWorkspaceState()).bookmarks),['poetry']);
assert.equal((await store.getWorkspaceState()).tasks.earth,undefined);
const beforeMutationFailure=json(await store.getWorkspaceState());
indexedDB.control.failAfter=0;
await assert.rejects(store.updateWorkspaceState(object({toggleBookmark:'lost',taskUpserts:{lost:{step:3}}})),reason=>reason.name==='QuotaExceededError');
indexedDB.control.failAfter=-1;
assert.deepEqual(json(await store.getWorkspaceState()),beforeMutationFailure);
await assert.rejects(store.updateWorkspaceState(object({taskDeletes:['../invalid']})),/收藏列表/);
await assert.rejects(store.updateWorkspaceState(object({taskUpserts:{'../invalid':{}}})),/创作任务/);
await store.putWorkspaceState(object({bookmarks:[],tasks:{}}));

// Codes survive rename; versions preserve exact files and metadata instead of aliasing current edits.
let alpha=await store.put(record({title:'First lesson',sourceReferences:[{projectId:'earth',projectCode:'TS-C-EARTH',title:'Earth'}]}),{saveVersion:true});
expectCode(alpha.projectCode);const alphaCode=alpha.projectCode;
const version1=await store.getVersion(alpha.id,alpha.currentVersionId);
assert.equal(version1.number,1);assert.equal(await version1.snapshot.attachment.blob.text(),'<h1>Lesson</h1>');
alpha.title='Edited lesson';alpha.projectCode='TS-L-FFFFFFFFFFFFFFFF';alpha.attachment=file('<h1>Second</h1>');
alpha=await store.put(alpha,{saveVersion:true});
assert.equal(alpha.projectCode,alphaCode,'Renaming or supplying another code cannot change identity');
const version2=await store.getVersion(alpha.id,alpha.currentVersionId);
assert.equal(version2.number,2);
version1.snapshot.title='Caller mutation';
assert.equal((await store.getVersion(alpha.id,version1.id)).snapshot.title,'First lesson');
assert.equal(await(await store.getVersion(alpha.id,version1.id)).snapshot.attachment.blob.text(),'<h1>Lesson</h1>');
const restored=await store.restoreVersion(alpha.id,version1.id);
assert.equal(restored.restoredFromVersionId,version1.id);
assert.equal((await store.get(alpha.id)).title,'Edited lesson','Restoring only creates an editable draft');
assert.equal((await store.listVersions(alpha.id)).length,2,'Restoring never rewrites or appends history until explicit save');
assert(restored.sourceReferences.some(ref=>ref.versionId===version1.id));
alpha=await store.put(restored,{saveVersion:true,clearDraft:true});
assert.equal(alpha.currentVersionNumber,3);assert.equal(await store.getDraft(),null);
const version3=await store.getVersion(alpha.id,alpha.currentVersionId);
assert.deepEqual(json(await store.listVersions(alpha.id)).map(item=>item.number),[3,2,1]);
let beta=await store.put(record({title:'Derived lesson',sourceReferences:[{projectId:alpha.id,projectCode:alpha.projectCode,versionId:version2.id,versionNumber:2,title:'Edited lesson'}]},'<h1>Second</h1>'),{saveVersion:true});
beta.coverFile=file('cover bytes','cover.png','image/png');beta=await store.put(beta,{saveVersion:true});
await store.putDraft(record({id:alpha.id,projectCode:alpha.projectCode,title:'Unfinished adaptation',sourceReferences:[{projectId:beta.id,projectCode:beta.projectCode,versionId:beta.currentVersionId,versionNumber:2}]},'<h1>Second</h1>'));
await store.putWorkspaceState(object({bookmarks:['earth',alpha.id,alpha.id,beta.id],tasks:{[alpha.id]:{projectId:alpha.id,sourceReferences:[{projectId:beta.id,projectCode:beta.projectCode,versionId:beta.currentVersionId}],text:'Plan a lesson'},earth:{step:2}}}));
await store.putWorkspaceState(object({bookmarks:['earth',alpha.id,beta.id]}));
assert.equal((await store.getWorkspaceState()).tasks.earth.step,2,'Partial writes preserve the other workspace field');
assert.equal((await store.getWorkspaceState()).initialized,true);
const exported=await exportJSON();
assert.equal(exported.version,2);assert.equal(exported.projects.length,2);assert.equal(exported.versions.length,5);
assert.equal(Object.keys(exported.files).length,3,'Repeated attachment bytes across current versions, history, and draft are deduplicated');
const inspection=await store.inspectBackup(backupBlob(exported));
assert.equal(inspection.identical,2);assert.equal(inspection.conflicts.length,0);
const repeated=await store.importBackup(backupBlob(exported));
assert.equal(repeated.count,0);assert.equal(repeated.restoredVersions,0);
assert.deepEqual(content(await exportJSON()),content(exported),'Importing the same backup has no content changes');

// The complete workspace round-trip includes drafts, references, files, and immutable snapshots.
await store.setScope('restored');
const imported=await store.importBackup(backupBlob(exported));
assert.equal(imported.count,2);assert.equal(imported.restoredVersions,5);assert(imported.restoredDraft);
assert.deepEqual(content(await exportJSON()),content(exported));
assert.equal(await(await store.getVersion(alpha.id,version2.id)).snapshot.attachment.blob.text(),'<h1>Second</h1>');

// A matching current project can recover missing historical versions without duplicating the project.
const restoredState=indexedDB.databases.get('tashan-practice-library-account-restored');
restoredState.meta.get('versions').value=restoredState.meta.get('versions').value.filter(item=>item.id!==version1.id);
assert.equal((await store.importBackup(backupBlob(exported))).restoredVersions,1);
assert.equal((await store.listVersions(alpha.id)).length,3);

// Conflicts preserve existing content; explicit copy remaps the whole incoming reference graph.
for(const id of [alpha.id,beta.id]){const item=await store.get(id);item.title='Local changes '+id;await store.put(item);}
await store.clearDraft();
const conflictInspection=await store.inspectBackup(backupBlob(exported));
assert.equal(conflictInspection.conflicts.length,2);
assert.equal((await store.importBackup(backupBlob(exported))).count,0);
await store.clearDraft();
const copied=await store.importBackup(backupBlob(exported),{conflict:'copy'});
assert.equal(copied.copied,2);assert.equal(copied.count,2);assert.equal(copied.restoredVersions,5);
const copiedAlpha=await store.get(copied.idMap[alpha.id]),copiedBeta=await store.get(copied.idMap[beta.id]);
assert.notEqual(copiedAlpha.id,alpha.id);assert.notEqual(copiedAlpha.projectCode,alphaCode);
assert.equal(copiedBeta.sourceReferences[0].projectId,copiedAlpha.id);
assert.equal(copiedBeta.sourceReferences[0].projectCode,copiedAlpha.projectCode);
const copiedAlphaVersions=await store.listVersions(copiedAlpha.id),copiedV2=copiedAlphaVersions.find(item=>item.number===2);
assert.equal(copiedBeta.sourceReferences[0].versionId,copiedV2.id);
assert.notEqual(copiedV2.id,version2.id);
assert.equal((await store.getDraft()).id,copiedAlpha.id);
assert.equal((await store.getDraft()).sourceReferences[0].projectId,copiedBeta.id);
assert.equal((await store.getWorkspaceState()).tasks[copiedAlpha.id].sourceReferences[0].projectId,copiedBeta.id);
assert((await store.getWorkspaceState()).bookmarks.includes(copiedAlpha.id));
assert.equal((await store.get(alpha.id)).title,'Local changes '+alpha.id,'The conflicting original remains unchanged');
const copiedV3=copiedAlphaVersions.find(item=>item.number===3);
assert.equal(copiedV3.snapshot.sourceReferences.find(ref=>ref.projectId===copiedAlpha.id).versionId,copiedAlphaVersions.find(item=>item.number===1).id);

// Bad hashes, duplicate codes, and inconsistent history fail before any workspace writes.
const beforeInvalid=content(await exportJSON());
const corrupted=json(exported);const hash=Object.keys(corrupted.files)[0];corrupted.files[hash].base64=Buffer.from('corrupt').toString('base64');
await assert.rejects(store.importBackup(backupBlob(corrupted)),/校验/);
const duplicateCode=json(exported);duplicateCode.projects[1].projectCode=duplicateCode.projects[0].projectCode;
await assert.rejects(store.importBackup(backupBlob(duplicateCode)),/重复的项目编号/);
const badHistory=json(exported);badHistory.versions[0].snapshot.currentVersionNumber=900;
await assert.rejects(store.importBackup(backupBlob(badHistory)),/快照的版本编号/);
assert.deepEqual(content(await exportJSON()),beforeInvalid);

// Quota failures cannot partially import projects, bookmarks, tasks, draft, or versions.
await store.setScope('rollback');
await store.putWorkspaceState(object({bookmarks:['existing'],tasks:{existing:{step:9}}}));
const beforeFailure=content(await exportJSON());
indexedDB.control.failAfter=2;
await assert.rejects(store.importBackup(backupBlob(exported)),reason=>reason.name==='QuotaExceededError');
indexedDB.control.failAfter=-1;
assert.deepEqual(content(await exportJSON()),beforeFailure);
assert.equal((await store.list()).length,0);

// Cloud adoption keeps the owner's stable project/version identity and resumes at the next number.
await store.setScope('cloud-device');
const cloudMetadata=object({id:version3.id,number:version3.number,createdAt:version3.createdAt,note:version3.note,sourceReferences:json(version3.snapshot.sourceReferences)});
const cloudRecord=await store.decodeRecord(await store.encodeRecord(version3.snapshot));
const adopted=await store.adoptVersion(cloudRecord,cloudMetadata);
assert.equal(adopted.id,alpha.id);assert.equal(adopted.projectCode,alphaCode);assert.equal(adopted.currentVersionNumber,3);
await store.adoptVersion(cloudRecord,cloudMetadata);
assert.equal((await store.listVersions(alpha.id)).length,1,'Repeated cloud adoption is idempotent');
const version4=await store.saveVersion(alpha.id);
assert.equal(version4.number,4);
await store.adoptVersion(cloudRecord,cloudMetadata);
assert.equal((await store.get(alpha.id)).currentVersionNumber,4,'Downloading an old matching version cannot move current backwards');
const changedCloud=await store.decodeRecord(await store.encodeRecord(version3.snapshot));changedCloud.title='Cloud differs';
await assert.rejects(store.adoptVersion(changedCloud,cloudMetadata),/内容不同/);
const tamperedMetadata=object({...json(cloudMetadata),note:'Changed immutable note'});
await assert.rejects(store.adoptVersion(cloudRecord,tamperedMetadata),/不可变快照/);
const beforeAdoptFailure=content(await exportJSON());
const newCloud=record({id:'local-cloud-other',projectCode:'TS-L-123456789ABCDEF0',title:'Another'},'cloud');
indexedDB.control.failAfter=1;
await assert.rejects(store.adoptVersion(newCloud,object({id:'version-cloud-other',number:8,createdAt:new Date().toISOString()})),reason=>reason.name==='QuotaExceededError');
indexedDB.control.failAfter=-1;
assert.deepEqual(content(await exportJSON()),beforeAdoptFailure);

// Cloud-only history can be backed up portably without mutating the active local workspace.
const beforeRemoteExport=content(await exportJSON());
const remoteHistory=await store.exportProjectVersions([await store.getVersion(alpha.id,version3.id),version4]);
const remoteBackup=JSON.parse(await remoteHistory.text());
assert.equal(remoteBackup.versions.length,2);assert.equal(remoteBackup.projects[0].currentVersionNumber,4);
assert.equal(Object.keys(remoteBackup.files).length,1,'Remote snapshots share their identical attachment content');
assert.deepEqual(content(await exportJSON()),beforeRemoteExport,'Exporting cloud history does not write local records');
await store.setScope('cloud-export-restored');
await store.importBackup(remoteHistory);
assert.equal((await store.get(alpha.id)).currentVersionNumber,4);
assert.equal((await store.listVersions(alpha.id)).length,2);
await assert.rejects(store.exportProjectVersions([version4,version4]),/版本信息无效/);

// Version-one backups remain usable, but duplicates no longer multiply on repeated imports.
await store.setScope('legacy-import');
const legacy=backupBlob({format:'tashan-practice-library',version:1,projects:[{id:'local-legacy',title:'Old',attachment:{name:'old.md',base64:Buffer.from('legacy').toString('base64')}}],draft:{title:'Old draft'}});
assert.equal((await store.importBackup(legacy)).count,1);
assert.equal((await store.importBackup(legacy)).identical,1);
expectCode((await store.get('local-legacy')).projectCode);
assert.equal((await store.getWorkspaceState()).initialized,false,'A v1 backup must not suppress one-time legacy workspace migration');

// Capture the scope before file parsing/hashing, including an A→B→A switch, and abort in-flight writes.
await store.setScope('race-a');
let resumeText;
class DelayedBackup extends Blob {text(){return new Promise(resolve=>{resumeText=()=>super.text().then(resolve);});}}
const pendingImport=store.importBackup(new DelayedBackup([JSON.stringify(exported)]));
await store.setScope('race-b');await store.setScope('race-a');resumeText();
await assert.rejects(pendingImport,/账号已切换/);
assert.equal((await store.list()).length,0);
let resumeBytes;
class DelayedFile extends Blob {arrayBuffer(){return new Promise(resolve=>{resumeBytes=()=>super.arrayBuffer().then(resolve);});}}
const delayed=record({title:'Delayed'},null);delayed.attachment={...object({name:'delayed.html',type:'text/html'}),blob:new DelayedFile(['private'])};
const pendingPut=store.put(delayed,{saveVersion:true});
await store.setScope('race-b');resumeBytes();await assert.rejects(pendingPut,/账号已切换/);
assert.equal((await store.list()).length,0);
await store.setScope('race-a');indexedDB.control.delay=20;
const pendingState=store.putWorkspaceState(object({bookmarks:['private'],tasks:{private:{text:'private'}}}));
await new Promise(resolve=>setTimeout(resolve,5));await store.setScope('race-b');
await assert.rejects(pendingState,/账号已切换/);indexedDB.control.delay=0;
await store.setScope('race-a');assert.equal((await store.getWorkspaceState()).initialized,false);
await assert.rejects(store.setScope('../invalid'),/范围无效/);
// Maximum supported Base64 attachments use linear validation/decoding, including padding cases.
await store.setScope('large-portable-files');
{
  const attachmentBytes=10*1024*1024,coverBytes=5*1024*1024;
  const payload={format:'tashan-practice-library',version:1,projects:[{id:'local-max-base64',title:'10 MB attachment and 5 MB cover',attachment:{name:'maximum.html',type:'text/html',base64:Buffer.alloc(attachmentBytes,90).toString('base64')},coverFile:{name:'maximum.png',type:'image/png',base64:Buffer.alloc(coverBytes,80).toString('base64')}}],draft:null};
  assert.equal((await store.importBackup(backupBlob(payload))).count,1);
  const saved=await store.get('local-max-base64');
  assert.equal(saved.attachment.blob.size,attachmentBytes);assert.equal(saved.coverFile.blob.size,coverBytes);
  const portable=await store.exportAll();
  await store.remove(saved.id);
  assert.equal((await store.importBackup(portable)).count,1,'Maximum files also survive the deduplicated v2 file table');
  const restored=await store.get(saved.id),bytes=new Uint8Array(await restored.attachment.blob.arrayBuffer());
  assert.equal(bytes[0],90);assert.equal(bytes[bytes.length-1],90);
  assert.equal(restored.attachment.sha256,saved.attachment.sha256);
  assert.equal(restored.coverFile.sha256,saved.coverFile.sha256);
  for(const base64 of ['A===','AA=A','AA?=','AAA','===A']){
    await assert.rejects(store.decodeRecord(object({id:'local-malformed',attachment:{name:'bad.md',base64}})),/附件内容/);
  }
  for(const [base64,expected] of [['',''],['YQ==','a'],['YWI=','ab'],['YWJj','abc']]){
    assert.equal(await(await store.decodeRecord(object({id:'local-valid-padding',attachment:{name:'valid.md',base64}}))).attachment.blob.text(),expected);
  }
}
// A larger server-side history reports the portable backup limit explicitly without local writes.
await store.setScope('oversized-remote-history');
{
  const now=new Date().toISOString(),versions=[];
  for(let number=1;number<=6;number++){
    const snapshot=record({id:'local-big-history',projectCode:'TS-L-AABBCCDDEEFF0011',title:'Large history'},null);
    snapshot.attachment={...object({name:'version.html',type:'text/html'}),blob:new Blob([Buffer.alloc(10*1024*1024,number)],{type:'text/html'})};
    versions.push({...object({id:'version-big-'+number,projectId:snapshot.id,projectCode:snapshot.projectCode,number,createdAt:now}),snapshot});
  }
  await assert.rejects(store.exportProjectVersions(versions),/完整历史备份上限为 50 MB/);
  assert.equal((await store.list()).length,0,'A rejected remote-history export cannot mutate local projects');
}
console.log('Project model checks passed: stable identities, complete v2/v1 backups, deduplicated files, immutable snapshots, provenance remapping, cloud adoption, atomic rollback, account-switch isolation, 10 MB Base64 round trips, and explicit portable-history limits.');
