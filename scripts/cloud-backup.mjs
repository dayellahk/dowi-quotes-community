import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {DatabaseSync,backup} from 'node:sqlite';
import {encryptBackup,expiredBackups} from '../lib/cloud-backup.mjs';
import {objectStorage} from '../lib/object-storage.mjs';
const dir=process.env.DATA_DIR||'data',objects=objectStorage(),temp=fs.mkdtempSync(path.join(os.tmpdir(),'dowi-backup-'));let database;
try{
 if(!objects.enabled)throw Error('TOS is not configured');
 const key=Buffer.from(process.env.BACKUP_ENCRYPTION_KEY||'','base64');if(key.length!==32)throw Error('Backup encryption key is missing');
 database=new DatabaseSync(path.join(dir,'workspace.sqlite'));await backup(database,path.join(temp,'snapshot.sqlite'));database.close();database=undefined;
 const snapshot=new DatabaseSync(path.join(temp,'snapshot.sqlite'));
 const hasCompanyWorkspaces=snapshot.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='company_workspaces'").get();
 const assets=hasCompanyWorkspaces
  ?snapshot.prepare('SELECT payload FROM company_workspaces').all().flatMap(r=>JSON.parse(r.payload).assets||[])
  :snapshot.prepare("SELECT payload FROM records WHERE collection='assets'").all().map(r=>JSON.parse(r.payload));
 snapshot.close();
 for(const asset of assets)if(asset.storage!=='tos')throw Error('Backup requires every attachment to be persisted to TOS');
 const files=[...new Map(assets.map(a=>[a.id,{id:a.id,sha256:a.sha256,size:a.size}])).values()];
 const payload=Buffer.from(JSON.stringify({format:'dowi-cloud-backup',version:1,created:new Date().toISOString(),database:fs.readFileSync(path.join(temp,'snapshot.sqlite')).toString('base64'),files}));
 const encrypted=encryptBackup(payload,key),date=new Date().toISOString().slice(0,10);await objects.put('backups/daily/'+date+'.enc',encrypted);
 if(new Date().getUTCDay()===0)await objects.put('backups/weekly/'+date+'.enc',encrypted);
 for(const old of expiredBackups(await objects.list('backups/')))await objects.remove(old.Key);
 fs.writeFileSync(path.join(dir,'backup-status.json'),JSON.stringify({status:'Healthy',lastSuccess:new Date().toISOString(),files:files.length}),{mode:0o600});console.log('Encrypted backup completed');
}catch(e){fs.writeFileSync(path.join(dir,'backup-status.json'),JSON.stringify({status:'Failed',lastAttempt:new Date().toISOString(),error:e.message}),{mode:0o600});console.error(e.message);process.exitCode=1}finally{database?.close();fs.rmSync(temp,{recursive:true,force:true})}
