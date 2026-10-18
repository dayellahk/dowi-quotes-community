import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {seed} from './seed.mjs';

const collections=['quotes','contacts','items','templates','deliveries','assets','leads','reviews','mailDeliveries'];
export function normalize(db) {
 db.settings={phone:'',address:'',website:'',...db.settings};
 db.webhooks??={url:'',baseURL:process.env.PUBLIC_URL||'http://127.0.0.1:3000',baseURLConfigured:Boolean(process.env.PUBLIC_URL),enabled:false,secret:'',events:[],paused:false};
 for(const key of collections)db[key]??=[];
 for(const q of db.quotes){q.items=(q.items||[]).map(i=>({cost:0,...i}));q.attachments??=[];q.privateNotes??=[];q.views??=0;q.followups??=[];q.progress??='Active';q.archived??=false;q.currency??=db.settings.currency||'HKD';q.exchangeRate??=1}
 db.items=db.items.map(i=>({cost:0,...i}));return db;
}
export function emptyWorkspace(){return normalize({settings:{company:'Dowi Quotes',email:'',currency:'HKD',tax:0,terms:''}})}
export function createStore(file){
 fs.mkdirSync(path.dirname(file),{recursive:true,mode:0o700});
 const target=file.endsWith('.json')?file.replace(/\.json$/,'.sqlite'):file;
 const sql=new DatabaseSync(target);fs.chmodSync(target,0o600);
 sql.exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
 CREATE TABLE IF NOT EXISTS workspace_meta(key TEXT PRIMARY KEY,value TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS records(collection TEXT NOT NULL,id TEXT NOT NULL,position INTEGER NOT NULL,payload TEXT NOT NULL,PRIMARY KEY(collection,id));
 CREATE TABLE IF NOT EXISTS schema_version(version INTEGER PRIMARY KEY); INSERT OR IGNORE INTO schema_version VALUES(1);
 CREATE TABLE IF NOT EXISTS revisions(id INTEGER PRIMARY KEY CHECK(id=1),value INTEGER NOT NULL); INSERT OR IGNORE INTO revisions VALUES(1,0);
 CREATE TABLE IF NOT EXISTS tenants(id TEXT PRIMARY KEY,name TEXT NOT NULL,created TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS companies(id TEXT PRIMARY KEY,tenant_id TEXT NOT NULL REFERENCES tenants(id),name TEXT NOT NULL,created TEXT NOT NULL);
 CREATE INDEX IF NOT EXISTS companies_tenant ON companies(tenant_id);
 CREATE TABLE IF NOT EXISTS company_workspaces(company_id TEXT PRIMARY KEY REFERENCES companies(id) ON DELETE CASCADE,payload TEXT NOT NULL,revision INTEGER NOT NULL DEFAULT 0);
 CREATE TABLE IF NOT EXISTS custom_domains(company_id TEXT PRIMARY KEY REFERENCES companies(id) ON DELETE CASCADE,hostname TEXT UNIQUE NOT NULL,cloudflare_id TEXT,status TEXT NOT NULL,txt_name TEXT,txt_value TEXT,cname_target TEXT,created TEXT NOT NULL,updated TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS fx_cache(pair TEXT PRIMARY KEY,rate REAL NOT NULL,rate_date TEXT NOT NULL,updated INTEGER NOT NULL);`);
 const defaultTenantId='tenant-default';
 function legacyWorkspace(){
  const legacyMeta=sql.prepare('SELECT key,value FROM workspace_meta').all();const hasLegacy=legacyMeta.length>0||sql.prepare('SELECT 1 FROM records LIMIT 1').get();
  if(!hasLegacy)return normalize(process.env.NODE_ENV==='production'||process.env.EMPTY_WORKSPACE==='true'?emptyWorkspace():structuredClone(seed));
  const meta={};for(const r of legacyMeta)meta[r.key]=JSON.parse(r.value);
  const result={...meta};for(const key of collections)result[key]=sql.prepare('SELECT payload FROM records WHERE collection=? ORDER BY position').all(key).map(r=>JSON.parse(r.payload));
  return normalize(Object.keys(result).length?result:(process.env.NODE_ENV==='production'||process.env.EMPTY_WORKSPACE==='true'?emptyWorkspace():structuredClone(seed)));
 }
 if(!sql.prepare('SELECT 1 FROM tenants LIMIT 1').get())sql.prepare('INSERT INTO tenants(id,name,created) VALUES(?,?,?)').run(defaultTenantId,'Workspace',new Date().toISOString());
 if(!sql.prepare('SELECT 1 FROM companies LIMIT 1').get()){
  const initial=legacyWorkspace(),companyId='company-default';
  sql.exec('BEGIN IMMEDIATE');try{
   sql.prepare('INSERT INTO companies(id,tenant_id,name,created) VALUES(?,?,?,?)').run(companyId,defaultTenantId,initial.settings.company||'Dowi Quotes',new Date().toISOString());
   sql.prepare('INSERT INTO company_workspaces(company_id,payload,revision) VALUES(?,?,0)').run(companyId,JSON.stringify(initial));
   sql.exec('COMMIT');
  }catch(e){sql.exec('ROLLBACK');throw e}
 }
 if(!sql.prepare('PRAGMA table_info(tenants)').all().some(c=>c.name==='public_id'))sql.exec('ALTER TABLE tenants ADD COLUMN public_id TEXT');
 sql.exec('BEGIN IMMEDIATE');try{
  let next=sql.prepare('SELECT COALESCE(MAX(CAST(public_id AS INTEGER)),10000)+1 n FROM tenants').get().n;
  for(const row of sql.prepare('SELECT id FROM tenants WHERE public_id IS NULL ORDER BY created,id').all())sql.prepare('UPDATE tenants SET public_id=? WHERE id=?').run(String(next++),row.id);
  sql.exec('CREATE UNIQUE INDEX IF NOT EXISTS tenant_public_id ON tenants(public_id); COMMIT');
 }catch(e){sql.exec('ROLLBACK');throw e}
 const defaultCompanyId=sql.prepare('SELECT id FROM companies WHERE tenant_id=? ORDER BY created,id LIMIT 1').get(defaultTenantId).id;
 function companies(tenantId=defaultTenantId){return sql.prepare('SELECT id,tenant_id AS tenantId,(SELECT public_id FROM tenants WHERE tenants.id=companies.tenant_id) AS tenantCode,name,created FROM companies WHERE tenant_id=? ORDER BY created,id').all(tenantId)}
 function allCompanies(){return sql.prepare('SELECT id,tenant_id AS tenantId,(SELECT public_id FROM tenants WHERE tenants.id=companies.tenant_id) AS tenantCode,name,created FROM companies ORDER BY created,id').all()}
 function company(companyId){return sql.prepare('SELECT id,tenant_id AS tenantId,(SELECT public_id FROM tenants WHERE tenants.id=companies.tenant_id) AS tenantCode,name,created FROM companies WHERE id=?').get(companyId)||null}
 function createCompany(tenantId,settings){
  if(!sql.prepare('SELECT 1 FROM tenants WHERE id=?').get(tenantId))throw Object.assign(Error('Tenant not found'),{status:404});
  const companyId=crypto.randomUUID(),workspace=emptyWorkspace();workspace.settings={...workspace.settings,...settings};
  sql.exec('BEGIN IMMEDIATE');try{sql.prepare('INSERT INTO companies(id,tenant_id,name,created) VALUES(?,?,?,?)').run(companyId,tenantId,workspace.settings.company,new Date().toISOString());sql.prepare('INSERT INTO company_workspaces(company_id,payload,revision) VALUES(?,?,0)').run(companyId,JSON.stringify(workspace));sql.exec('COMMIT')}catch(e){sql.exec('ROLLBACK');throw e}
  return company(companyId);
 }
 function save(db,sideEffect,companyId=defaultCompanyId){sql.exec('BEGIN IMMEDIATE');try{
  const row=sql.prepare('SELECT revision FROM company_workspaces WHERE company_id=?').get(companyId);if(!row)throw Object.assign(Error('Company workspace not found'),{status:404});
  if(db._revision!==undefined&&db._revision!==row.revision){const error=Error('Workspace changed. Refresh and try again.');error.status=409;throw error}
  const normalized=normalize(db);sql.prepare('UPDATE company_workspaces SET payload=?,revision=? WHERE company_id=?').run(JSON.stringify(normalized),row.revision+1,companyId);
  sql.prepare('UPDATE companies SET name=? WHERE id=?').run(normalized.settings.company||'Company',companyId);
  if(companyId===defaultCompanyId){sql.exec('DELETE FROM workspace_meta; DELETE FROM records');const meta=sql.prepare('INSERT INTO workspace_meta VALUES(?,?)'),legacy=sql.prepare('INSERT INTO records VALUES(?,?,?,?)');for(const [key,value] of Object.entries(normalized)){if(collections.includes(key))value.forEach((item,i)=>legacy.run(key,item.id,i,JSON.stringify(item)));else meta.run(key,JSON.stringify(value))}}
  sideEffect?.();sql.exec('COMMIT');Object.defineProperty(db,'_revision',{value:row.revision+1,writable:true,configurable:true});
 }catch(e){sql.exec('ROLLBACK');throw e}}
 function read(companyId=defaultCompanyId){const row=sql.prepare('SELECT payload,revision FROM company_workspaces WHERE company_id=?').get(companyId);if(!row)throw Object.assign(Error('Company workspace not found'),{status:404});const db=normalize(JSON.parse(row.payload));Object.defineProperty(db,'_revision',{value:row.revision,writable:true,configurable:true});return db}
 function companyForQuote(token){for(const c of sql.prepare('SELECT id FROM companies').all()){const db=read(c.id);const quote=db.quotes.find(q=>q.token===token);if(quote)return {company:company(c.id),quoteId:quote.id}}return null}
 function domainForHost(hostname){return sql.prepare("SELECT d.*,c.tenant_id AS tenantId FROM custom_domains d JOIN companies c ON c.id=d.company_id WHERE lower(d.hostname)=lower(?) AND d.status='active'").get(hostname)||null}
 function getDomain(companyId){return sql.prepare('SELECT hostname,cloudflare_id AS cloudflareId,status,txt_name AS txtName,txt_value AS txtValue,cname_target AS cnameTarget,created,updated FROM custom_domains WHERE company_id=?').get(companyId)||null}
 function setDomain(companyId,domain){sql.prepare(`INSERT INTO custom_domains(company_id,hostname,cloudflare_id,status,txt_name,txt_value,cname_target,created,updated) VALUES(?,?,?,?,?,?,?,?,?)
  ON CONFLICT(company_id) DO UPDATE SET hostname=excluded.hostname,cloudflare_id=excluded.cloudflare_id,status=excluded.status,txt_name=excluded.txt_name,txt_value=excluded.txt_value,cname_target=excluded.cname_target,updated=excluded.updated`).run(companyId,domain.hostname,domain.cloudflareId||null,domain.status,domain.txtName||null,domain.txtValue||null,domain.cnameTarget||null,domain.created||new Date().toISOString(),new Date().toISOString());return getDomain(companyId)}
 function deleteDomain(companyId){sql.prepare('DELETE FROM custom_domains WHERE company_id=?').run(companyId)}
 return {read,save,sql,file:target,defaultTenantId,defaultCompanyId,companies,allCompanies,company,createCompany,companyForQuote,domainForHost,getDomain,setDomain,deleteDomain,close:()=>sql.close()};
}
