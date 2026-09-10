// Local development only: account/project rows share one durable SQLite transaction.
import { mkdirSync, chmodSync, existsSync, writeFileSync, renameSync, rmSync, readFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { PROJECT_LIMITS, projectError, requireProjectUser } from './projects-api.mjs';

const notFound = () => projectError(404,'PROJECT_NOT_FOUND','项目或版本不存在。');
const fileManifest = files => Object.fromEntries(Object.entries(files).map(([field,{bytes,...info}])=>[field,info]));
export class LocalProjectsProvider {
  constructor(accounts,{filesDir}) {
    this.accounts=accounts;this.db=accounts.db;this.filesDir=resolve(filesDir);
    mkdirSync(this.filesDir,{recursive:true,mode:0o700});chmodSync(this.filesDir,0o700);
    this.db.exec(`CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,owner_id TEXT NOT NULL REFERENCES accounts(id),project_code TEXT NOT NULL UNIQUE,
      published_version_id TEXT,created_at TEXT NOT NULL,updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS projects_owner ON projects(owner_id,updated_at DESC);
    CREATE TABLE IF NOT EXISTS project_versions (
      id TEXT PRIMARY KEY,project_id TEXT NOT NULL REFERENCES projects(id),number INTEGER NOT NULL,
      created_at TEXT NOT NULL,note TEXT NOT NULL,source_references TEXT NOT NULL,metadata TEXT NOT NULL,
      files TEXT NOT NULL,fingerprint TEXT NOT NULL,received_at TEXT NOT NULL,
      UNIQUE(project_id,number)
    );
    CREATE TABLE IF NOT EXISTS project_assets (
      owner_id TEXT NOT NULL REFERENCES accounts(id),sha256 TEXT NOT NULL,size INTEGER NOT NULL,
      PRIMARY KEY(owner_id,sha256)
    );`);
  }
  async status(){return {configured:true,mode:'local'};}
  async rateLimit(user,{operation}){await this.accounts.rateLimit(`projects:${operation}:${user.id}`,{limit:operation==='upload'?20:30,windowSeconds:60});}
  actor(user){requireProjectUser(user);const row=this.accounts.account(user.id);if(!row||row.status!=='active')throw projectError(401,'UNAUTHENTICATED','请重新登录。');if(row.must_change_password)throw projectError(403,'PASSWORD_CHANGE_REQUIRED','请先修改管理员重置的密码。');return row;}
  owned(user,id){this.actor(user);const row=this.db.prepare('SELECT * FROM projects WHERE id=? AND owner_id=?').get(id,user.id);if(!row)throw notFound();return row;}
  summary(row,published=false){
    const latest=this.db.prepare('SELECT * FROM project_versions WHERE project_id=? ORDER BY number DESC LIMIT 1').get(row.id);
    const visible=published?this.db.prepare('SELECT * FROM project_versions WHERE project_id=? AND id=?').get(row.id,row.published_version_id):latest;
    const publishedRow=row.published_version_id&&this.db.prepare('SELECT number FROM project_versions WHERE id=? AND project_id=?').get(row.published_version_id,row.id);
    const metadata=visible?JSON.parse(visible.metadata):{},files=visible?JSON.parse(visible.files):{};
    return {id:row.id,projectCode:row.project_code,title:metadata.title||'',kind:metadata.kind||'visual',subject:metadata.subject||'',
      latestVersionId:published?row.published_version_id:latest?.id||null,latestVersionNumber:published?publishedRow?.number||null:latest?.number||null,
      publishedVersionId:row.published_version_id,publishedVersionNumber:publishedRow?.number||null,
      coverURL:files.coverFile?`/api/v1/${published?'published':'projects'}/${row.id}/versions/${visible.id}/files/coverFile`:null,
      createdAt:row.created_at,updatedAt:published?visible?.created_at:row.updated_at};
  }
  async listProjects(user,{page=1}={}){
    this.actor(user);const total=this.db.prepare('SELECT count(*) n FROM projects WHERE owner_id=?').get(user.id).n;
    const rows=this.db.prepare('SELECT * FROM projects WHERE owner_id=? ORDER BY updated_at DESC,id LIMIT ? OFFSET ?').all(user.id,PROJECT_LIMITS.pageSize,(page-1)*PROJECT_LIMITS.pageSize);
    return {projects:rows.map(row=>this.summary(row)),total,page,pageSize:PROJECT_LIMITS.pageSize};
  }
  async listPublished({page=1}={}){
    const total=this.db.prepare("SELECT count(*) n FROM projects p JOIN accounts a ON a.id=p.owner_id WHERE p.published_version_id IS NOT NULL AND a.status='active'").get().n;
    const rows=this.db.prepare("SELECT p.* FROM projects p JOIN accounts a ON a.id=p.owner_id JOIN project_versions v ON v.id=p.published_version_id AND v.project_id=p.id WHERE a.status='active' ORDER BY v.created_at DESC,p.id LIMIT ? OFFSET ?").all(PROJECT_LIMITS.pageSize,(page-1)*PROJECT_LIMITS.pageSize);
    return {projects:rows.map(row=>this.summary(row,true)),total,page,pageSize:PROJECT_LIMITS.pageSize};
  }
  async getProject(user,id,{published=false}={}){
    const row=published?this.db.prepare("SELECT p.* FROM projects p JOIN accounts a ON a.id=p.owner_id WHERE p.id=? AND p.published_version_id IS NOT NULL AND a.status='active'").get(id):this.owned(user,id);
    if(!row)throw notFound();return this.summary(row,published);
  }
  async listVersions(user,id){
    const project=this.owned(user,id);
    const versions=this.db.prepare('SELECT id,number,created_at,note,source_references,fingerprint FROM project_versions WHERE project_id=? ORDER BY number DESC').all(id).map(row=>({id:row.id,number:row.number,createdAt:row.created_at,note:row.note,sourceReferences:JSON.parse(row.source_references),fingerprint:row.fingerprint}));
    return {project:this.summary(project),versions};
  }
  version(row){return {id:row.id,number:row.number,createdAt:row.created_at,note:row.note,sourceReferences:JSON.parse(row.source_references),metadata:JSON.parse(row.metadata),files:JSON.parse(row.files)};}
  async getVersion(user,id,versionId,{published=false}={}){
    let project;
    if(published)project=this.db.prepare("SELECT p.* FROM projects p JOIN accounts a ON a.id=p.owner_id WHERE p.id=? AND p.published_version_id=? AND a.status='active'").get(id,versionId);
    else project=this.owned(user,id);
    if(!project)throw notFound();
    const version=this.db.prepare('SELECT * FROM project_versions WHERE project_id=? AND id=?').get(id,versionId);
    if(!version)throw notFound();
    return {project:this.summary(project,published),version:this.version(version)};
  }
  async saveVersion(user,snapshot){
    return this.accounts.transaction(()=>{
      this.actor(user);
      const existing=this.db.prepare('SELECT * FROM projects WHERE id=?').get(snapshot.projectId);
      if(existing&&existing.owner_id!==user.id)throw notFound();
      if(existing&&existing.project_code!==snapshot.projectCode)throw projectError(409,'PROJECT_CODE_CONFLICT','项目编号与已保存项目不一致。');
      const prior=this.db.prepare('SELECT * FROM project_versions WHERE id=?').get(snapshot.id);
      if(prior){if(prior.project_id!==snapshot.projectId||prior.fingerprint!==snapshot.fingerprint)throw projectError(409,'VERSION_CONFLICT','这个版本已存在，内容不同。请保存为新版本。');return {created:false,project:this.summary(existing),version:this.version(prior)};}
      if(this.db.prepare('SELECT id FROM projects WHERE project_code=? AND id<>?').get(snapshot.projectCode,snapshot.projectId))throw projectError(409,'PROJECT_CODE_CONFLICT','项目编号已存在，请保留当前编号并处理重复项目。');
      if(this.db.prepare('SELECT id FROM project_versions WHERE project_id=? AND number=?').get(snapshot.projectId,snapshot.number))throw projectError(409,'VERSION_NUMBER_CONFLICT','这个版本序号已经存在。');
      if(!existing&&this.db.prepare('SELECT count(*) n FROM projects WHERE owner_id=?').get(user.id).n>=PROJECT_LIMITS.projectsPerOwner)throw projectError(409,'PROJECT_LIMIT','已达到项目数量上限。');
      if(this.db.prepare('SELECT count(*) n FROM project_versions WHERE project_id=?').get(snapshot.projectId).n>=PROJECT_LIMITS.versionsPerProject)throw projectError(409,'VERSION_LIMIT','已达到此项目的版本数量上限。');
      const unique=new Map(Object.values(snapshot.files).map(file=>[file.sha256,file]));
      const extra=[...unique.values()].filter(file=>!this.db.prepare('SELECT 1 FROM project_assets WHERE owner_id=? AND sha256=?').get(user.id,file.sha256));
      const used=this.db.prepare('SELECT coalesce(sum(size),0) bytes FROM project_assets WHERE owner_id=?').get(user.id).bytes+this.db.prepare('SELECT coalesce(sum(length(cast(v.metadata AS BLOB))+length(cast(v.source_references AS BLOB))+length(cast(v.files AS BLOB))+length(cast(v.note AS BLOB))),0) bytes FROM project_versions v JOIN projects p ON p.id=v.project_id WHERE p.owner_id=?').get(user.id).bytes;
      const addedMetadata=Buffer.byteLength(JSON.stringify(snapshot.metadata)+JSON.stringify(snapshot.sourceReferences)+JSON.stringify(fileManifest(snapshot.files))+snapshot.note);
      if(used+extra.reduce((sum,file)=>sum+file.size,0)+addedMetadata>PROJECT_LIMITS.ownerBytes)throw projectError(413,'STORAGE_QUOTA','账号资料已达到 200 MB 上限。');
      const directory=join(this.filesDir,user.id),createdFiles=[];
      mkdirSync(directory,{recursive:true,mode:0o700});
      try{
        for(const file of unique.values()){
          const path=join(directory,file.sha256);
          if(!existsSync(path)){
            const temporary=join(directory,'.upload-'+randomUUID());
            try{writeFileSync(temporary,file.bytes,{flag:'wx',mode:0o600});renameSync(temporary,path);createdFiles.push(path);}finally{rmSync(temporary,{force:true});}
          }
          this.db.prepare('INSERT OR IGNORE INTO project_assets VALUES (?,?,?)').run(user.id,file.sha256,file.size);
        }
        const now=new Date().toISOString();
        if(!existing)this.db.prepare('INSERT INTO projects VALUES (?,?,?,?,?,?)').run(snapshot.projectId,user.id,snapshot.projectCode,null,now,now);
        this.db.prepare('INSERT INTO project_versions VALUES (?,?,?,?,?,?,?,?,?,?)').run(snapshot.id,snapshot.projectId,snapshot.number,snapshot.createdAt,snapshot.note,JSON.stringify(snapshot.sourceReferences),JSON.stringify(snapshot.metadata),JSON.stringify(fileManifest(snapshot.files)),snapshot.fingerprint,now);
        this.db.prepare('UPDATE projects SET updated_at=? WHERE id=?').run(now,snapshot.projectId);
        this.accounts.record(user,'project.version_saved',snapshot.projectId,{versionId:snapshot.id,number:snapshot.number});
        return {created:true,project:this.summary(this.db.prepare('SELECT * FROM projects WHERE id=?').get(snapshot.projectId)),version:this.version(this.db.prepare('SELECT * FROM project_versions WHERE id=?').get(snapshot.id))};
      }catch(error){for(const path of createdFiles)rmSync(path,{force:true});throw error;}
    });
  }
  async publish(user,id,{versionId,expectedVersionId}){
    return this.accounts.transaction(()=>{
      const project=this.owned(user,id);
      if(project.published_version_id!==expectedVersionId){if(project.published_version_id===versionId)return this.summary(project);throw projectError(409,'PUBLICATION_CONFLICT','公开版本已在另一处更新，请刷新后再操作。');}
      if(!this.db.prepare('SELECT id FROM project_versions WHERE project_id=? AND id=?').get(id,versionId))throw notFound();
      this.db.prepare('UPDATE projects SET published_version_id=?,updated_at=? WHERE id=?').run(versionId,new Date().toISOString(),id);
      this.accounts.record(user,'project.published',id,{versionId});
      return this.summary(this.db.prepare('SELECT * FROM projects WHERE id=?').get(id));
    });
  }
  async unpublish(user,id,{expectedVersionId}){
    return this.accounts.transaction(()=>{
      const project=this.owned(user,id);
      if(project.published_version_id===null)return this.summary(project);
      if(project.published_version_id!==expectedVersionId)throw projectError(409,'PUBLICATION_CONFLICT','公开版本已在另一处更新，请刷新后再操作。');
      this.db.prepare('UPDATE projects SET published_version_id=NULL,updated_at=? WHERE id=?').run(new Date().toISOString(),id);
      this.accounts.record(user,'project.unpublished',id,{versionId:expectedVersionId});
      return this.summary(this.db.prepare('SELECT * FROM projects WHERE id=?').get(id));
    });
  }
  async getFile(user,id,versionId,field,{published=false}={}){
    const record=await this.getVersion(user,id,versionId,{published});
    const file=record.version.files[field];if(!file)throw notFound();
    const owner=this.db.prepare('SELECT owner_id FROM projects WHERE id=?').get(id).owner_id;
    try{return {...file,body:readFileSync(join(this.filesDir,owner,file.sha256))};}catch{throw projectError(503,'PROJECT_FILE_UNAVAILABLE','项目文件暂时不可用。');}
  }
}
