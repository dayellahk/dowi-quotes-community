import {test} from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createStore} from '../lib/store.mjs';
import {createAuth,hash} from '../lib/auth.mjs';
import {createMCP} from '../lib/mcp.mjs';

test('MCP OAuth resource exposes scoped quote tools and AI edits require review before changing drafts',async()=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'dowi-mcp-'));
 const store=createStore(path.join(directory,'workspace.json'));
 const env={AUTH_MODE:'oidc',OWNER_EMAIL:'owner@example.com',PUBLIC_URL:'https://quotes.example.com',TOKEN_ENCRYPTION_KEY:crypto.randomBytes(32).toString('base64')};
 const auth=createAuth(store.sql,env,store.defaultTenantId),mcp=createMCP(store,auth,env),companyId=store.defaultCompanyId;
 const owner=store.sql.prepare('SELECT * FROM members WHERE email=?').get('owner@example.com');
 const session=crypto.randomBytes(32).toString('base64url');store.sql.prepare('INSERT INTO sessions VALUES(?,?,?)').run(hash(session),owner.id,Date.now()+60000);
 const accessToken=crypto.randomBytes(32).toString('base64url');store.sql.prepare('INSERT INTO mcp_access_tokens VALUES(?,?,?,?,?,?,?)').run(hash(accessToken),owner.id,owner.tenant_id,'quotes:read quotes:write','https://quotes.example.com/mcp',Date.now()+60000,new Date().toISOString());
 const db=store.read(companyId);db.contacts.unshift({id:'customer-1',name:'Customer One',company:'Example Ltd',email:'customer@example.com'});db.quotes.unshift({id:'quote-1',number:1001,title:'Original draft',status:'Draft',contactId:'customer-1',items:[{id:'item-1',name:'Design',description:'',qty:2,price:100,cost:40,optional:false,selected:true,discountType:'none',discountValue:0}],tax:0,notes:'',terms:'',expires:'2027-01-01T00:00:00.000Z',attachments:[],currency:'USD',exchangeRate:1,exchangeRateDate:'',exchangeRateSource:'same currency',updated:'2026-10-14T00:00:00.000Z',messages:[],activity:[]});store.save(db,undefined,companyId);
 const invoke=async(method,url,{body='',authorization='',cookie=''}={})=>{const headers={};const req={method,url,headers:{...(authorization?{authorization:`Bearer ${authorization}`}:{ }),...(cookie?{cookie}:{}),'content-type':'application/json'},async *[Symbol.asyncIterator](){if(body)yield Buffer.from(body)}};const res={writeHead(status,values={}){this.status=status;Object.assign(headers,values)},setHeader(key,value){headers[key]=value},end(value){this.body=value}};const handled=await mcp.route(req,res,new URL(url,'https://quotes.example.com'),{}, {companyId,tenantId:store.defaultTenantId});return {handled,status:res.status,headers,data:res.body?JSON.parse(res.body):undefined}};
 try{
  const metadata=await invoke('GET','/.well-known/oauth-protected-resource');assert.equal(metadata.handled,true);assert.equal(metadata.status,200);assert.equal(metadata.data.resource,'https://quotes.example.com/mcp');
  const unauthorized=await invoke('POST','/mcp',{body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/list'})});assert.equal(unauthorized.handled,true);assert.equal(unauthorized.status,401);assert.match(unauthorized.headers['WWW-Authenticate'],/oauth-protected-resource/);
  const proposal=await invoke('POST','/mcp',{authorization:accessToken,body:JSON.stringify({jsonrpc:'2.0',id:2,method:'tools/call',params:{name:'propose_quote_edit',arguments:{company_id:companyId,quote_id:'quote-1',changes:{title:'AI revised draft',items:[{id:'item-1',name:'Design',description:'',qty:3,price:120,cost:45,discountType:'percent',discountValue:10}]}}}})});
  assert.equal(proposal.status,200);assert.equal(proposal.data.result.structuredContent.status,'Pending approval');assert.equal(store.read(companyId).quotes[0].title,'Original draft');
  const pending=await invoke('GET','/api/mcp-proposals',{cookie:`dowi_session=${session}`});assert.equal(pending.status,200);assert.equal(pending.data.proposals.length,1);assert.equal(pending.data.proposals[0].changes.title,'AI revised draft');
  const approved=await invoke('POST',`/api/mcp-proposals/${pending.data.proposals[0].id}/approve`,{cookie:`dowi_session=${session}`});assert.equal(approved.status,200);const updated=store.read(companyId).quotes[0];assert.equal(updated.title,'AI revised draft');assert.equal(updated.items[0].qty,3);assert.equal(store.sql.prepare('SELECT status FROM mcp_edit_proposals').get().status,'Approved');
 }finally{store.close();fs.rmSync(directory,{recursive:true,force:true})}
});
