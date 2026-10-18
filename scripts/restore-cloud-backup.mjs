import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {decryptBackup} from '../lib/cloud-backup.mjs';
import {objectStorage} from '../lib/object-storage.mjs';

const [source,destination]=process.argv.slice(2);
if(!source||!destination||fs.existsSync(destination))throw Error('Provide encrypted backup file and a new destination directory');
const snapshot=JSON.parse(decryptBackup(fs.readFileSync(source),Buffer.from(process.env.BACKUP_ENCRYPTION_KEY||'','base64')));
if(snapshot.format!=='dowi-cloud-backup'||snapshot.version!==1)throw Error('Unsupported backup');
const objects=objectStorage();
const sanitizeWorkspace=value=>{
 const workspace=JSON.parse(value);
 for(const collection of ['mailDeliveries','deliveries'])for(const record of workspace[collection]||[]){
  if(['Queued','Delivering','Pending','Retrying'].includes(record.status)){record.status='Cancelled';record.error='Restored backup: automatic resend disabled'}
 }
 if(workspace.webhooks){workspace.webhooks.enabled=false;workspace.webhooks.paused=true}
 return JSON.stringify(workspace);
};
fs.mkdirSync(destination,{mode:0o700});
try{
 fs.writeFileSync(path.join(destination,'workspace.sqlite'),Buffer.from(snapshot.database,'base64'),{mode:0o600});
 const db=new DatabaseSync(path.join(destination,'workspace.sqlite'));
 if(db.prepare('PRAGMA integrity_check').get().integrity_check!=='ok')throw Error('Database integrity check failed');
 db.exec('PRAGMA foreign_keys=ON; DELETE FROM sessions; DELETE FROM oauth_flows; DELETE FROM auth_codes; DELETE FROM mail_grants');
 for(const table of ['mcp_access_tokens','mcp_named_tokens','mcp_oauth_codes','mcp_oauth_flows','xero_flows','xero_connections'])if(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(table))db.exec(`DELETE FROM ${table}`);
 if(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='xero_invoices'").get())db.exec("UPDATE xero_invoices SET status='Failed',error='Restored backup: automatic invoice sync disabled' WHERE status IN ('Queued','Retrying')");

 const hasCompanyWorkspaces=db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='company_workspaces'").get();
 if(hasCompanyWorkspaces){
  for(const row of db.prepare('SELECT company_id,payload FROM company_workspaces').all())db.prepare('UPDATE company_workspaces SET payload=? WHERE company_id=?').run(sanitizeWorkspace(row.payload),row.company_id);
 }
 for(const collection of ['mailDeliveries','deliveries'])for(const row of db.prepare('SELECT id,payload FROM records WHERE collection=?').all(collection)){
  const record=JSON.parse(row.payload);
  if(['Queued','Delivering','Pending','Retrying'].includes(record.status)){record.status='Cancelled';record.error='Restored backup: automatic resend disabled';db.prepare('UPDATE records SET payload=? WHERE collection=? AND id=?').run(JSON.stringify(record),collection,row.id)}
 }
 const web=db.prepare("SELECT value FROM workspace_meta WHERE key='webhooks'").get();
 if(web){const settings=JSON.parse(web.value);settings.enabled=false;settings.paused=true;db.prepare("UPDATE workspace_meta SET value=? WHERE key='webhooks'").run(JSON.stringify(settings))}
 db.close();

 fs.mkdirSync(path.join(destination,'files'),{mode:0o700});
 for(const file of snapshot.files){
  if(!/^[0-9a-f-]{36}$/i.test(file.id))throw Error('Invalid attachment identity');
  const bytes=await objects.get('files/'+file.id);
  if(bytes.length!==file.size||crypto.createHash('sha256').update(bytes).digest('hex')!==file.sha256)throw Error('Attachment integrity check failed');
  fs.writeFileSync(path.join(destination,'files',file.id),bytes,{mode:0o600});
 }
 console.log('Restore verified; sessions revoked; pending deliveries cancelled');
}catch(e){fs.rmSync(destination,{recursive:true,force:true});throw e}
