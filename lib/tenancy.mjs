import crypto from 'node:crypto';
import {emptyWorkspace} from './store.mjs';

export function initializeMemberships(sql){
 sql.exec(`CREATE TABLE IF NOT EXISTS tenant_memberships(member_id TEXT NOT NULL,tenant_id TEXT NOT NULL,role TEXT NOT NULL CHECK(role IN ('owner','member')),active INTEGER NOT NULL DEFAULT 1,PRIMARY KEY(member_id,tenant_id));
 CREATE TABLE IF NOT EXISTS tenancy_migrations(version INTEGER PRIMARY KEY);`);
 if(sql.prepare('SELECT 1 FROM tenancy_migrations WHERE version=1').get())return;
 sql.exec('BEGIN IMMEDIATE');
 try{
  const hasCompanies=sql.prepare("SELECT 1 FROM sqlite_master WHERE name='companies'").get();
  if(hasCompanies){
   const seen=new Set();
   for(const c of sql.prepare('SELECT * FROM companies ORDER BY created,id').all()){
    let tenant=c.tenant_id;
    if(seen.has(tenant)){
     tenant=crypto.randomUUID();
     const code=String(sql.prepare('SELECT COALESCE(MAX(CAST(public_id AS INTEGER)),10000)+1 n FROM tenants').get().n);
     sql.prepare('INSERT INTO tenants(id,name,created,public_id) VALUES(?,?,?,?)').run(tenant,c.name,c.created,code);
     sql.prepare('UPDATE companies SET tenant_id=? WHERE id=?').run(tenant,c.id);
    }
    seen.add(c.tenant_id);
    sql.prepare('INSERT OR IGNORE INTO tenant_memberships SELECT id,?,role,active FROM members WHERE tenant_id=?').run(tenant,c.tenant_id);
   }
   if(sql.prepare("SELECT 1 FROM sqlite_master WHERE name='mcp_edit_proposals'").get())sql.exec('UPDATE mcp_edit_proposals SET tenant_id=(SELECT tenant_id FROM companies WHERE companies.id=mcp_edit_proposals.company_id)');
   sql.exec('CREATE UNIQUE INDEX IF NOT EXISTS company_one_per_tenant ON companies(tenant_id)');
   // Old MCP grants must be re-consented after the access boundary changes.
   for(const name of ['mcp_access_tokens','mcp_oauth_codes','mcp_oauth_flows'])if(sql.prepare('SELECT 1 FROM sqlite_master WHERE name=?').get(name))sql.exec(`DELETE FROM ${name}`);
  }else sql.exec('INSERT OR IGNORE INTO tenant_memberships SELECT id,tenant_id,role,active FROM members');
  sql.exec('INSERT INTO tenancy_migrations VALUES(1); COMMIT');
 }catch(e){sql.exec('ROLLBACK');throw e}
}
export function memberCompanies(store,memberId){
 return store.sql.prepare(`SELECT c.id,c.tenant_id AS tenantId,t.public_id AS tenantCode,c.name,c.created,tm.role FROM companies c JOIN tenants t ON t.id=c.tenant_id JOIN tenant_memberships tm ON tm.tenant_id=c.tenant_id WHERE tm.member_id=? AND tm.active=1 ORDER BY c.created,c.id`).all(memberId);
}
export function createIndependentCompany(store,memberId,settings){
 const sql=store.sql,tenant=crypto.randomUUID(),companyId=crypto.randomUUID(),created=new Date().toISOString(),workspace=emptyWorkspace();workspace.settings={...workspace.settings,...settings};
 sql.exec('BEGIN IMMEDIATE');try{
  const code=String(sql.prepare('SELECT COALESCE(MAX(CAST(public_id AS INTEGER)),10000)+1 n FROM tenants').get().n);
  sql.prepare('INSERT INTO tenants(id,name,created,public_id) VALUES(?,?,?,?)').run(tenant,settings.company,created,code);
  sql.prepare('INSERT INTO companies(id,tenant_id,name,created) VALUES(?,?,?,?)').run(companyId,tenant,settings.company,created);
  sql.prepare('INSERT INTO company_workspaces VALUES(?,?,0)').run(companyId,JSON.stringify(workspace));
  if(memberId)sql.prepare("INSERT INTO tenant_memberships VALUES(?,?,'owner',1)").run(memberId,tenant);
  if(memberId&&sql.prepare("SELECT 1 FROM sqlite_master WHERE name='tenant_creators'").get()){
   sql.prepare('INSERT INTO tenant_creators VALUES(?,?)').run(tenant,memberId);
   sql.prepare("INSERT INTO tenant_roles VALUES(?,'sales','Sales',1,1)").run(tenant);
  }
  sql.exec('COMMIT');return store.company(companyId);
 }catch(e){sql.exec('ROLLBACK');throw e}
}
