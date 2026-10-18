import {test} from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawn} from 'node:child_process';
import {DatabaseSync} from 'node:sqlite';
import {createStore} from '../lib/store.mjs';
import {createAuth,hash} from '../lib/auth.mjs';
import {objectStorage} from '../lib/object-storage.mjs';
import {createMCP} from '../lib/mcp.mjs';
import {createXero} from '../lib/xero.mjs';
const run=(script,args,env)=>new Promise((resolve,reject)=>{const child=spawn(process.execPath,[script,...args],{env});let error='';child.stderr.on('data',b=>error+=b);child.on('error',reject);child.on('close',code=>code===0?resolve():reject(Error(error)))});
test('encrypted cloud backup round-trips SQLite and TOS attachments, revokes sessions and rejects corrupt files',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'dowi-recovery-')),directory=path.join(root,'source'),objects=new Map();
 const server=http.createServer(async(req,res)=>{const url=new URL(req.url,'http://localhost'),key=decodeURIComponent(url.pathname).replace(/^\/test-bucket\//,'');if(req.method==='PUT'){const chunks=[];for await(const b of req)chunks.push(b);objects.set(key,Buffer.concat(chunks));res.writeHead(200,{ETag:'"test"'});res.end();return}if(req.method==='GET'&&url.searchParams.has('list-type')){const contents=[...objects].filter(([key])=>key.startsWith(url.searchParams.get('prefix')||'')).map(([key,bytes])=>`<Contents><Key>${key}</Key><Size>${bytes.length}</Size></Contents>`).join('');res.setHeader('Content-Type','application/xml');res.end(`<ListBucketResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/"><IsTruncated>false</IsTruncated>${contents}</ListBucketResult>`);return}if(req.method==='GET'&&objects.has(key)){res.end(objects.get(key));return}if(req.method==='DELETE'){objects.delete(key);res.writeHead(204);res.end();return}res.writeHead(404);res.end()});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const env={...process.env,NODE_ENV:'test',DATA_DIR:directory,TOS_BUCKET:'test-bucket',TOS_REGION:'ap-southeast-1',TOS_ENDPOINT:`http://127.0.0.1:${server.address().port}`,TOS_ACCESS_KEY_ID:'test-access',TOS_SECRET_ACCESS_KEY:'test-secret',TOS_PREFIX:'dowi-quotes/',BACKUP_ENCRYPTION_KEY:crypto.randomBytes(32).toString('base64')};
 let store,restored;
 try{
  store=createStore(path.join(directory,'workspace.json'));const authEnv={AUTH_MODE:'oidc',OWNER_EMAIL:'owner@example.com',PUBLIC_URL:'https://quotes.example.com',TOKEN_ENCRYPTION_KEY:crypto.randomBytes(32).toString('base64')},auth=createAuth(store.sql,authEnv);const mcp=createMCP(store,auth,authEnv);createXero(store,auth,authEnv);
  const member=store.sql.prepare('SELECT id FROM members').get();store.sql.prepare('INSERT INTO sessions VALUES(?,?,?)').run(hash('old-session'),member.id,Date.now()+60000);
  mcp.issueAgentToken(member.id,store.defaultTenantId,'Before restore');
  store.sql.prepare('INSERT INTO xero_connections VALUES(?,?,?,?,?,?,?)').run(store.defaultCompanyId,'xero-org','connection-id','Test org','encrypted-secret','{}',new Date().toISOString());
  store.sql.prepare("INSERT INTO xero_invoices(company_id,quote_id,xero_tenant_id,status,created,updated) VALUES(?,?,?,'Queued',?,?)").run(store.defaultCompanyId,'test-quote','xero-org',new Date().toISOString(),new Date().toISOString());
  const bytes=Buffer.from('Private attachment recovery fixture'),id=crypto.randomUUID(),folder=path.join(directory,'files');fs.mkdirSync(folder);fs.writeFileSync(path.join(folder,id),bytes);
  const asset={id,name:'fixture.txt',type:'text/plain',size:bytes.length,sha256:crypto.createHash('sha256').update(bytes).digest('hex')};
  await objectStorage(env).uploadAsset(asset,folder);assert.equal(asset.storage,'tos');const db=store.read();db.assets=[asset];db.mailDeliveries=[{id:'queued-mail',status:'Queued'}];db.webhooks.enabled=true;store.save(db);store.close();store=null;
  await run('scripts/cloud-backup.mjs',[],env);assert.equal(JSON.parse(fs.readFileSync(path.join(directory,'backup-status.json'))).status,'Healthy');
  const entry=[...objects].find(([key])=>key.startsWith('dowi-quotes/backups/daily/'));assert(entry);assert(!entry[1].includes(bytes));const source=path.join(root,'backup.enc');fs.writeFileSync(source,entry[1]);
  const destination=path.join(root,'recovered');await run('scripts/restore-cloud-backup.mjs',[source,destination],env);
  restored=new DatabaseSync(path.join(destination,'workspace.sqlite'));assert.equal(restored.prepare('SELECT count(*) n FROM sessions').get().n,0);assert.equal(restored.prepare('SELECT count(*) n FROM mcp_access_tokens').get().n,0);assert.equal(restored.prepare('SELECT count(*) n FROM xero_connections').get().n,0);assert.equal(restored.prepare('SELECT status FROM xero_invoices').get().status,'Failed');assert.equal(JSON.parse(restored.prepare("SELECT payload FROM records WHERE collection='mailDeliveries'").get().payload).status,'Cancelled');assert.equal(JSON.parse(restored.prepare("SELECT value FROM workspace_meta WHERE key='webhooks'").get().value).enabled,false);assert.deepEqual(fs.readFileSync(path.join(destination,'files',id)),bytes);restored.close();restored=null;
  objects.set('dowi-quotes/files/'+id,Buffer.from('corrupt'));const failed=path.join(root,'invalid-recovery');await assert.rejects(()=>run('scripts/restore-cloud-backup.mjs',[source,failed],env),/Attachment integrity/);assert(!fs.existsSync(failed));
 }finally{store?.close();restored?.close();await new Promise(resolve=>server.close(resolve));fs.rmSync(root,{recursive:true,force:true})}
});
