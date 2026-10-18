import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {createStore} from '../lib/store.mjs';
import {createAuth} from '../lib/auth.mjs';
import {createIndependentCompany} from '../lib/tenancy.mjs';
import {publicAddress,webhookURL,postWebhook} from '../lib/webhook-network.mjs';
import {objectStorage} from '../lib/object-storage.mjs';
import {createBackup,restoreBackup} from '../lib/backup.mjs';

test('member invitations cannot replace existing credentials or take over another tenant owner',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'dowi-security-invite-'));
 const store=createStore(path.join(dir,'db.sqlite'));
 try{
  const env={DEPLOYMENT_MODE:'self-hosted',AUTH_MODE:'local',OWNER_EMAIL:'owner@example.test',INTERNAL_PASSWORD:'original-owner-password-12345',TOKEN_ENCRYPTION_KEY:crypto.randomBytes(32).toString('base64')};
  const auth=createAuth(store.sql,env);
  const basic=(email,password,tenant)=>({headers:{authorization:'Basic '+Buffer.from(email+':'+password).toString('base64')},workspaceTenantId:tenant});
  const ownerReq=basic(env.OWNER_EMAIL,env.INTERNAL_PASSWORD),victim=auth.session(ownerReq);
  async function call(req,url,body){let result;await auth.route({...req,method:'POST'},{writeHead(){},setHeader(){},end(s){result=JSON.parse(s)}},new URL('https://quotes.example.test'+url),body);return result}
  await call(ownerReq,'/api/members',{email:'other-owner@example.test',password:'different-owner-password-12345'});
  const other=auth.session(basic('other-owner@example.test','different-owner-password-12345'));
  const company=createIndependentCompany(store,other.id,{company:'Separate company'});
  const otherReq=basic(other.email,'different-owner-password-12345',company.tenantId);
  await assert.rejects(()=>call(otherReq,'/api/members',{email:victim.email,password:'attacker-selected-password-12345'}),{status:409});
  assert.equal(auth.session(basic(victim.email,'attacker-selected-password-12345')),null);
  assert.equal(auth.session(ownerReq).id,victim.id);
  assert.equal(store.sql.prepare('SELECT 1 FROM tenant_memberships WHERE tenant_id=? AND member_id=?').get(company.tenantId,victim.id),undefined);
  await call(otherReq,'/api/members',{email:victim.email});
  await assert.rejects(()=>call(otherReq,'/api/members/'+victim.id+'/password',{password:'attacker-selected-password-12345'}),{status:409});
  // An existing federated account without a local password is protected too.
  store.sql.prepare('DELETE FROM local_passwords WHERE member_id=?').run(victim.id);
  await assert.rejects(()=>call(otherReq,'/api/members',{email:victim.email,password:'attacker-selected-password-12345'}),{status:409});
  assert.equal(store.sql.prepare('SELECT 1 FROM local_passwords WHERE member_id=?').get(victim.id),undefined);
 }finally{store.close();fs.rmSync(dir,{recursive:true,force:true})}
});

test('production webhooks block local/reserved IPv4, IPv6, plaintext and embedded credentials',()=>{
 for(const address of ['0.0.0.0','10.0.0.1','100.64.0.1','127.0.0.1','169.254.169.254','172.16.0.1','192.168.1.1','192.0.2.1','198.18.0.1','198.51.100.1','203.0.113.1','224.0.0.1','255.255.255.255','::','::1','::ffff:127.0.0.1','::ffff:7f00:1','fc00::1','fe80::1','ff02::1','64:ff9b::a9fe:a9fe','2001:db8::1','2002:7f00:1::'])assert.equal(publicAddress(address),false,address);
 for(const address of ['8.8.8.8','1.1.1.1','2001:4860:4860::8888','2606:4700:4700::1111'])assert.equal(publicAddress(address),true,address);
 for(const url of ['http://public.example.test','https://127.0.0.1','https://[::1]','https://[::ffff:127.0.0.1]','https://'+'user:pass@public.example.test'])assert.throws(()=>webhookURL(url,{allowPrivate:false}));
 assert.doesNotThrow(()=>webhookURL('https://public.example.test',{allowPrivate:false}));
});

test('webhook connection rejects private and mixed DNS results at connection time',async()=>{
 for(const addresses of [[{address:'127.0.0.1',family:4}],[{address:'8.8.8.8',family:4},{address:'::1',family:6}]]){
  await assert.rejects(()=>postWebhook('https://public.example.test','{}',{}, {allowPrivate:false,lookup(host,options,callback){callback(null,addresses)}}),/non-public address/);
 }
});

test('explicit private webhook delivery does not follow redirects',async()=>{
 let calls=0;const server=http.createServer((req,res)=>{calls++;req.resume();res.writeHead(302,{Location:'/internal'});res.end()});
 server.listen(0,'127.0.0.1');await once(server,'listening');
 try{const response=await postWebhook('http://127.0.0.1:'+server.address().port,'{}',{}, {allowPrivate:true});assert.equal(response.status,302);assert.equal(response.ok,false);assert.equal(calls,1)}finally{await new Promise(resolve=>server.close(resolve))}
});

test('malformed targets stay contained; headers and socket-based login limits apply',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'dowi-security-http-'));
 const child=spawn(process.execPath,['server.mjs'],{env:{...process.env,PORT:'3198',HOST:'127.0.0.1',DATA_DIR:dir,INTERNAL_PASSWORD:'security-test-password'},stdio:['ignore','pipe','pipe']});
 const base='http://127.0.0.1:3198';
 try{
  await Promise.race([once(child.stdout,'data'),once(child,'exit').then(()=>{throw Error('Startup failed')})]);
  const bad=await new Promise((resolve,reject)=>{const req=http.request({host:'127.0.0.1',port:3198,path:'http://[invalid',method:'GET'},res=>{res.resume();resolve(res.statusCode)});req.on('error',reject);req.end()});
  assert.equal(bad,400);
  const health=await fetch(base+'/healthz');assert.equal(health.status,200);
  assert.match(health.headers.get('content-security-policy'),/frame-ancestors 'none'/);
  assert.doesNotMatch(health.headers.get('content-security-policy'),/script-src[^;]*'unsafe-inline'/);
  assert.equal(health.headers.get('x-frame-options'),'DENY');
  const primitive=await fetch(base+'/api/auth/local-login',{method:'POST',headers:{'Content-Type':'application/json'},body:'null'});assert.equal(primitive.status,400);
  let last;
  for(let n=0;n<32;n++)last=await fetch(base+'/api/auth/config',{headers:{'X-Real-IP':'198.51.100.'+n,'X-Forwarded-For':'198.51.100.'+n}});
  assert.equal(last.status,429);assert.equal(child.exitCode,null);
 }finally{if(child.exitCode===null){const done=once(child,'exit');child.kill();await done}fs.rmSync(dir,{recursive:true,force:true})}
});


test('attachment caching and backup recovery never overwrite raced files or follow symlinks',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'dowi-security-files-'));
 try{
  const folder=path.join(root,'files');fs.mkdirSync(folder);
  const outside=path.join(root,'outside');fs.writeFileSync(outside,'keep private');
  const id=crypto.randomUUID(),location=path.join(folder,id),asset={id,storage:'tos',size:12};
  const storage=objectStorage({});
  storage.get=async()=>{fs.symlinkSync(outside,location);return Buffer.from('replacement')};
  await storage.ensureLocal(asset,folder);
  assert.equal(fs.readFileSync(outside,'utf8'),'keep private');
  await assert.rejects(()=>storage.ensureLocal(asset,folder),{code:'ELOOP'});
  assert.throws(()=>createBackup({assets:[asset]},folder),{code:'ELOOP'});
  await assert.rejects(()=>storage.ensureLocal({...asset,id:'../outside'},folder),/Invalid attachment/);
  fs.unlinkSync(location);
  storage.get=async()=>{fs.writeFileSync(location,'concurrent request',{flag:'wx'});return Buffer.from('replacement')};
  await storage.ensureLocal(asset,folder);
  assert.equal(fs.readFileSync(location,'utf8'),'concurrent request');
  const workspace={settings:{},quotes:[],contacts:[],items:[],templates:[],assets:[]};
  const backup=createBackup(workspace,folder),destination=path.join(root,'restore');
  fs.symlinkSync(folder,destination);
  assert.throws(()=>restoreBackup(backup,destination),/must not exist/);
  assert.equal(fs.existsSync(path.join(folder,'workspace.json')),false);
 }finally{fs.rmSync(root,{recursive:true,force:true})}
});
