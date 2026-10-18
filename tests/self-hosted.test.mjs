import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {createAuth} from '../lib/auth.mjs';
import {objectStorage} from '../lib/object-storage.mjs';
import {createTurnstile} from '../lib/turnstile.mjs';
import crypto from 'node:crypto';
test('private deployment is explicit; hosted production still requires OIDC, TOS and Turnstile',()=>{
 const sql=new DatabaseSync(':memory:');
 const env={NODE_ENV:'production',PUBLIC_URL:'https://private.example',WEB_URL:'https://private.example',OWNER_EMAIL:'admin@example.com',INTERNAL_PASSWORD:crypto.randomBytes(24).toString('hex'),TOKEN_ENCRYPTION_KEY:crypto.randomBytes(32).toString('base64')};
 try{
  assert.throws(()=>createAuth(sql,{...env,TURNSTILE_SITE_KEY:'test-site',TURNSTILE_SECRET:'test-secret',TURNSTILE_HOSTNAMES:'private.example'}),/requires OIDC/);assert.throws(()=>objectStorage(env),/requires private BytePlus/);assert.throws(()=>createTurnstile(env),/requires a site key/);
  const privateEnv={...env,DEPLOYMENT_MODE:'self-hosted',STORAGE_MODE:'local'};
  assert.equal(createAuth(sql,privateEnv).enabled,false);assert.equal(objectStorage(privateEnv).enabled,false);assert.equal(createTurnstile(privateEnv).publicConfig().enabled,false);
  assert.throws(()=>createAuth(sql,{...privateEnv,INTERNAL_PASSWORD:'short'}),/at least 16/);
  assert.throws(()=>objectStorage({...privateEnv,STORAGE_MODE:undefined}),/requires private BytePlus/);
 }finally{sql.close()}
});
test('private local accounts use individual credentials, tenant roles, immediate revocation and no shared administrator password',async()=>{
 const {createStore}=await import('../lib/store.mjs');const {createIndependentCompany}=await import('../lib/tenancy.mjs');
 const fs=await import('node:fs');const os=await import('node:os');const path=await import('node:path');
 const folder=fs.mkdtempSync(path.join(os.tmpdir(),'dowi-private-users-'));const store=createStore(path.join(folder,'workspace.json'));
 const password='owner-long-password-123456',salesPassword='sales-long-password-123456';
 const env={DEPLOYMENT_MODE:'self-hosted',AUTH_MODE:'local',OWNER_EMAIL:'owner@example.com',PUBLIC_URL:'https://private.example',TOKEN_ENCRYPTION_KEY:crypto.randomBytes(32).toString('base64'),INTERNAL_PASSWORD:password};
 const auth=createAuth(store.sql,env);const basic=(email,password,tenantId)=>({headers:{authorization:'Basic '+Buffer.from(email+':'+password).toString('base64')},workspaceTenantId:tenantId});
 async function route(req,path,method,body){let data;await auth.route({...req,method},{writeHead(){},setHeader(){},end(value){data=JSON.parse(value)}},new URL('https://private.example'+path),body);return data}
 try{
  assert.equal(auth.session({headers:{}}),null);assert.equal(auth.session(basic('owner@example.com','wrong')),null);
  const owner=auth.session(basic('owner@example.com',password));assert.equal(owner.role,'owner');
  await route(basic('owner@example.com',password),'/api/members','POST',{email:'sales@example.com',password:salesPassword,roleId:'sales'});
  const sales=auth.session(basic('sales@example.com',salesPassword));assert.equal(sales.role,'member');assert.equal(sales.permissions.accountSettings,false);
  assert.throws(()=>auth.requireOwner(basic('sales@example.com',salesPassword)),{status:403});
  await assert.rejects(route(basic('sales@example.com',salesPassword),'/api/members/'+owner.id+'/password','POST',{password:'different-long-password-123'}),{status:403});
  const other=createIndependentCompany(store,owner.id,{company:'Other'});
  assert.equal(auth.session(basic('sales@example.com',salesPassword,other.tenantId)),null);
  const digest=store.sql.prepare('SELECT digest FROM local_passwords WHERE member_id=?').get(sales.id).digest;assert.notEqual(digest,salesPassword);assert.equal(digest.length,128);
  await route(basic('owner@example.com',password),'/api/members/'+sales.id+'/password','POST',{password:'replacement-password-123456'});
  assert.equal(auth.session(basic('sales@example.com',salesPassword)),null);assert.equal(auth.session(basic('sales@example.com','replacement-password-123456')).id,sales.id);
  await route(basic('owner@example.com',password),'/api/members/'+sales.id,'DELETE',{});
  assert.equal(auth.session(basic('sales@example.com','replacement-password-123456')),null);
 }finally{store.close();fs.rmSync(folder,{recursive:true,force:true})}
});
test('single-origin production private server login does not redirect to itself',async()=>{
 const {spawn}=await import('node:child_process');const {once}=await import('node:events');
 const fs=await import('node:fs');const os=await import('node:os');const path=await import('node:path');
 const folder=fs.mkdtempSync(path.join(os.tmpdir(),'dowi-private-login-'));
 const child=spawn(process.execPath,['server.mjs'],{env:{...process.env,NODE_ENV:'production',PORT:'3194',DATA_DIR:folder,DEPLOYMENT_MODE:'self-hosted',AUTH_MODE:'local',STORAGE_MODE:'local',PUBLIC_URL:'https://127.0.0.1:3194',WEB_URL:'https://127.0.0.1:3194',OWNER_EMAIL:'owner@example.com',INTERNAL_PASSWORD:'temporary-owner-password-123456',TOKEN_ENCRYPTION_KEY:crypto.randomBytes(32).toString('base64')},stdio:['ignore','pipe','pipe']});
 try{
  await Promise.race([once(child.stdout,'data'),once(child,'exit').then(()=>{throw Error('Server failed to start')})]);
  const response=await fetch('http://127.0.0.1:3194/login',{redirect:'manual'});
  assert.equal(response.status,200);assert.match(await response.text(),/account.js/);
  const config=await fetch('http://127.0.0.1:3194/api/auth/config').then(r=>r.json());assert.equal(config.localAccounts,true);
 }finally{if(child.exitCode===null){const done=once(child,'exit');child.kill();await done}fs.rmSync(folder,{recursive:true,force:true})}
});
