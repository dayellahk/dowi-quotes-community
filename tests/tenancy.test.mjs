import {test} from 'node:test';
import http from 'node:http';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {createStore} from '../lib/store.mjs';
import {createAuth,hash} from '../lib/auth.mjs';
import {createIndependentCompany,memberCompanies} from '../lib/tenancy.mjs';
const authEnv=()=>({WEB_USER_LIMIT:'5',AUTH_MODE:'oidc',OWNER_EMAIL:'owner@example.com',PUBLIC_URL:'http://127.0.0.1:3196',TOKEN_ENCRYPTION_KEY:crypto.randomBytes(32).toString('base64')});
test('legacy companies migrate to stable numeric tenants with existing access preserved exactly once',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'dowi-tenant-migrate-'));let store;
 try{store=createStore(path.join(dir,'workspace.json'));const extra=store.createCompany(store.defaultTenantId,{company:'Second company'});const env=authEnv();createAuth(store.sql,env);
 const owner=store.sql.prepare('SELECT id FROM members WHERE email=?').get(env.OWNER_EMAIL);const companies=memberCompanies(store,owner.id);assert.equal(companies.length,2);assert.notEqual(companies[0].tenantId,companies[1].tenantId);assert.notEqual(companies[0].tenantCode,companies[1].tenantCode);assert.match(companies[0].tenantCode,/^\d+$/);
 const second=store.company(extra.id);store.sql.prepare('UPDATE tenant_memberships SET active=0 WHERE tenant_id=?').run(second.tenantId);const codes=store.allCompanies().map(c=>c.tenantCode);store.close();store=createStore(path.join(dir,'workspace.json'));createAuth(store.sql,env);assert.deepEqual(store.allCompanies().map(c=>c.tenantCode),codes);assert.equal(memberCompanies(store,owner.id).length,1);await assert.rejects(createAuth(store.sql,env).send({memberId:owner.id,tenantId:second.tenantId,provider:'google'}),{responseCode:403});
 }finally{store?.close();fs.rmSync(dir,{recursive:true,force:true})}
});
test('HTTP company tenants isolate membership, roles, records, export and numeric routes',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'dowi-tenant-http-'));const env=authEnv();let child,store;
 try{
  store=createStore(path.join(dir,'workspace.json'));createAuth(store.sql,env);const owner=store.sql.prepare('SELECT id FROM members WHERE email=?').get(env.OWNER_EMAIL).id;
  const a=store.company(store.defaultCompanyId),b=createIndependentCompany(store,owner,{company:'Private second company',currency:'USD'});
  const ownerToken=crypto.randomBytes(32).toString('hex');store.sql.prepare('INSERT INTO sessions VALUES(?,?,?)').run(hash(ownerToken),owner,Date.now()+600000);
  child=spawn(process.execPath,['server.mjs'],{env:{...process.env,...env,PORT:'3196',DATA_DIR:dir,RECAPTCHA_REQUIRED:'false',TURNSTILE_REQUIRED:'false'},stdio:['ignore','pipe','pipe']});let errors='';child.stderr.on('data',d=>errors+=d);await Promise.race([once(child.stdout,'data'),once(child,'exit').then(()=>{throw Error(errors)})]);
  async function api(company,url,method='GET',body,token=ownerToken){const r=await fetch('http://127.0.0.1:3196/'+company.tenantCode+'/api/'+url,{method,headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});return {status:r.status,data:await r.json()}}
  assert.equal((await api(a,'workspace')).data.tenantId,a.tenantCode);
  assert.equal((await api(b,'contacts','POST',{name:'B private contact',email:'b@example.com',company:'B'})).status,201);
  assert.ok(!(await api(a,'workspace')).data.contacts.some(c=>c.name==='B private contact'));
  assert.equal((await api(a,'members','POST',{email:'member@example.com'})).status,201);
  const member=store.sql.prepare('SELECT id FROM members WHERE email=?').get('member@example.com').id;const token=crypto.randomBytes(32).toString('hex');store.sql.prepare('INSERT INTO sessions VALUES(?,?,?)').run(hash(token),member,Date.now()+600000);
  assert.equal((await api(a,'workspace','GET',null,token)).status,200);
  const workspace=(await api(a,'workspace')).data;
  assert.ok(workspace.teamMembers.some(m=>m.id===member&&m.active));
  assert.ok(!(await api(b,'workspace')).data.teamMembers.some(m=>m.id===member));
  const sample={...workspace.quotes[0],title:'Owner assignment QC',assigneeId:member};
  const assigned=await api(a,'quotes','POST',sample);assert.equal(assigned.status,201);assert.equal(assigned.data.assigneeId,member);
  const bWorkspace=(await api(b,'workspace')).data;
  assert.equal((await api(b,'quotes','POST',{...sample,contactId:bWorkspace.contacts[0].id})).status,400);
  assert.equal((await api(a,'quotes/'+assigned.data.id+'/assign','POST',{assigneeId:'unknown'})).status,400);
  assert.equal((await api(a,'quotes/'+assigned.data.id+'/assign','POST',{assigneeId:owner})).data.assigneeId,owner);
  const {assigneeId:unused,...defaultSample}=sample;assert.equal((await api(a,'quotes','POST',defaultSample)).data.assigneeId,owner);
  const restricted=(await api(a,'roles','POST',{name:'Quotes only',templatesItems:false,statsValues:false})).data;
  assert.equal((await api(a,'members/'+member,'PATCH',{roleId:restricted.id})).status,200);
  const limited=(await api(a,'workspace','GET',null,token)).data;assert.equal(limited.currentUser.permissions.statsValues,false);assert.deepEqual(limited.items,[]);assert.deepEqual(limited.templates,[]);
  assert.equal((await api(a,'items','GET',null,token)).status,403);assert.equal((await api(a,'templates','POST',{name:'Hidden'},token)).status,403);assert.equal((await api(a,'backup','GET',null,token)).status,403);
  assert.equal((await api(a,'members/'+member,'PATCH',{roleId:'sales'})).status,200);
  for(let i=0;i<3;i++)assert.equal((await api(a,'members','POST',{email:'seat'+i+'@example.com'})).status,201);
  assert.equal((await api(a,'members','POST',{email:'sixth@example.com'})).status,409);assert.equal(store.sql.prepare("SELECT COUNT(*) n FROM members WHERE email='sixth@example.com'").get().n,0,'Failed invitation rolls back the global account too');

  for(const endpoint of ['workspace','members','backup','assets/secret','mcp-proposals'])assert.equal((await api(b,endpoint,'GET',null,token)).status,403,endpoint);
  assert.equal((await api(a,'members','POST',{email:'intruder@example.com'},token)).status,403);
  assert.equal((await api(a,'settings','PUT',{company:'Intruder'},token)).status,403);
  assert.ok(!(await api(b,'members')).data.some(m=>m.id===member));
  await api(b,'members','POST',{email:'member@example.com'});assert.equal((await api(b,'workspace','GET',null,token)).status,200);
  await api(a,'members/'+member,'DELETE');assert.equal((await api(a,'workspace','GET',null,token)).status,403);assert.equal((await api(b,'workspace','GET',null,token)).status,200);
  assert.equal((await api(a,'workspace')).data.teamMembers.find(m=>m.id===member).active,false);
  const c=(await api(a,'companies','POST',{company:'Third company',currency:'HKD'})).data.company;assert.match(c.tenantCode,/^\d+$/);assert.equal((await api(c,'members')).data.length,1);
  const mismatch=await fetch('http://127.0.0.1:3196/'+a.tenantCode+'/api/workspace',{headers:{Authorization:'Bearer '+ownerToken,'X-Dowi-Company-ID':b.id}});assert.equal(mismatch.status,403);
  const page=await fetch('http://127.0.0.1:3196/'+a.tenantCode+'/settings',{headers:{Authorization:'Bearer '+ownerToken}});assert.equal(page.status,200);assert.match(await page.text(),/Dowi Quotes/);
  assert.equal((await fetch('http://127.0.0.1:3196/999999/settings',{headers:{Authorization:'Bearer '+ownerToken}})).status,403);
  const domainRequest=pathname=>new Promise((resolve,reject)=>{http.get(env.PUBLIC_URL+pathname,{headers:{Host:'customer-a.example.com',Authorization:'Bearer '+ownerToken}},res=>{let body='';res.on('data',d=>body+=d);res.on('end',()=>resolve({status:res.statusCode,body}))}).on('error',reject)});
  store.setDomain(a.id,{hostname:'customer-a.example.com',status:'active',cnameTarget:'origin.example.com'});
  const aQuote=store.read(a.id).quotes.find(q=>q.status==='Sent');
  assert.equal((await domainRequest('/quote-filters.js')).status,200,'Customer CNAME serves the shared application module dependencies');
  const own=await domainRequest('/api/shared/'+aQuote.token);assert.equal(own.status,200);assert.equal(JSON.parse(own.body).quote.items[0].cost,undefined);assert.equal(JSON.parse(own.body).quote.assigneeId,undefined);assert.equal(JSON.parse(own.body).teamMembers,undefined);
  const wrongCompany=store.read(b.id);wrongCompany.quotes.push({...structuredClone(aQuote),id:crypto.randomUUID(),token:crypto.randomBytes(24).toString('hex')});store.save(wrongCompany,undefined,b.id);
  assert.equal((await domainRequest('/api/shared/'+wrongCompany.quotes[0].token)).status,404);
  for(const privatePath of ['/api/workspace','/account','/login','/mcp'])assert.equal((await domainRequest(privatePath)).status,404);
  const verifier=crypto.randomBytes(32).toString('base64url'),redirect='https://chatgpt.com/connector_platform_oauth_redirect',client='https://chatgpt.com/oauth/client.json';
  const authorization=new URL(env.PUBLIC_URL+'/oauth/authorize');authorization.search=new URLSearchParams({client_id:client,redirect_uri:redirect,response_type:'code',code_challenge:hash(verifier),code_challenge_method:'S256',resource:env.PUBLIC_URL+'/mcp',scope:'quotes:read',state:'qc-state'});
  const consent=await fetch(authorization,{headers:{Authorization:'Bearer '+ownerToken}});assert.equal(consent.status,200);const consentHTML=await consent.text();assert.match(consentHTML,/name="tenant_id"/);
  const form=new URLSearchParams({flow:consentHTML.match(/name="flow" value="([^"]+)"/)[1],csrf:consentHTML.match(/name="csrf" value="([^"]+)"/)[1],tenant_id:b.tenantId,decision:'allow'});
  const grant=await fetch(env.PUBLIC_URL+'/oauth/consent',{method:'POST',headers:{Authorization:'Bearer '+ownerToken,'Content-Type':'application/x-www-form-urlencoded'},body:form,redirect:'manual'});assert.equal(grant.status,302);
  const code=new URL(grant.headers.get('location')).searchParams.get('code');
  const exchange=await fetch(env.PUBLIC_URL+'/oauth/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'authorization_code',code,code_verifier:verifier,client_id:client,redirect_uri:redirect,resource:env.PUBLIC_URL+'/mcp'})});assert.equal(exchange.status,200);const grantToken=(await exchange.json()).access_token;assert.equal(store.sql.prepare('SELECT tenant_id FROM mcp_access_tokens WHERE token_hash=?').get(hash(grantToken)).tenant_id,b.tenantId);
  const mcpToken=crypto.randomBytes(32).toString('hex');store.sql.prepare('INSERT INTO mcp_access_tokens VALUES(?,?,?,?,?,?,?)').run(hash(mcpToken),owner,a.tenantId,'quotes:read',env.PUBLIC_URL+'/mcp',Date.now()+60000,new Date().toISOString());
  const mcpCall=()=>fetch(env.PUBLIC_URL+'/mcp',{method:'POST',headers:{Authorization:'Bearer '+mcpToken,'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/call',params:{name:'list_quotes',arguments:{company_id:b.id}}})});
  assert.equal((await (await mcpCall()).json()).result.isError,true,'MCP token is bound to its consented tenant');
  store.sql.prepare("UPDATE tenant_memberships SET role='member' WHERE member_id=? AND tenant_id=?").run(owner,a.tenantId);
  assert.equal((await api(a,'members')).status,403,'Global owner identity cannot override a tenant member role');assert.equal((await api(b,'members')).status,200);
  store.sql.prepare('UPDATE tenant_memberships SET active=0 WHERE member_id=? AND tenant_id=?').run(owner,a.tenantId);assert.equal((await mcpCall()).status,401,'Removing tenant membership revokes MCP access');
  const loggedOut=await fetch(env.PUBLIC_URL+'/'+b.tenantCode+'/settings',{redirect:'manual'});assert.equal(loggedOut.status,302);assert.equal(loggedOut.headers.get('location'),'/login?tenant='+b.tenantCode);

 }finally{if(child&&child.exitCode===null){const done=once(child,'exit');child.kill();await done}store?.close();fs.rmSync(dir,{recursive:true,force:true})}
});
