import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import crypto from 'node:crypto';
import {createStore} from '../lib/store.mjs';
import {createAuth,hash} from '../lib/auth.mjs';
import {createMCP} from '../lib/mcp.mjs';
import {createIndependentCompany} from '../lib/tenancy.mjs';

test('agent tokens create only unsent drafts, retry idempotently, enforce tenant and revoke immediately',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'dowi-agent-')),store=createStore(path.join(dir,'workspace.json'));
 try{
  const env={AUTH_MODE:'oidc',OWNER_EMAIL:'owner@example.com',PUBLIC_URL:'https://api.example.com',TOKEN_ENCRYPTION_KEY:crypto.randomBytes(32).toString('base64')};
  const auth=createAuth(store.sql,env),mcp=createMCP(store,auth,env),owner=store.sql.prepare('SELECT * FROM members').get();
  const token=mcp.issueAgentToken(owner.id,owner.tenant_id,'Agent test',1);
  const other=createIndependentCompany(store,owner.id,{company:'Other company',currency:'HKD'});
  const db=store.read(),customer=db.contacts[0];assert(customer);
  const call=async(name,args,bearer=token.token)=>{
   const raw=JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/call',params:{name,arguments:args}}),req={method:'POST',url:'/mcp',headers:{authorization:'Bearer '+bearer},async *[Symbol.asyncIterator](){yield raw}},res={setHeader(){},writeHead(code){this.code=code},end(data){this.data=JSON.parse(data)}};
   await mcp.route(req,res,new URL('https://api.example.com/mcp'));return res;
  };
  const input={request_id:'retry-safe-1',title:'TEST Agent quotation',contactId:customer.id,items:[{name:'Service',qty:2,price:100,cost:25,discountType:'percent',discountValue:10}]};
  const result=await call('create_draft_quote',input),draft=result.data.result.structuredContent;assert.equal(draft.status,'Draft');assert.equal(draft.sent,false);assert.equal(draft.totals.total,180);
  const retry=await call('create_draft_quote',input);assert.equal(retry.data.result.structuredContent.quote_id,draft.quote_id);assert.equal(store.read().quotes.filter(q=>q.title===input.title).length,1);
  const saved=store.read().quotes.find(q=>q.id===draft.quote_id);assert.equal(saved.status,'Draft');assert.equal(saved.firstSent,undefined);assert.equal(saved.acceptance,undefined);
  assert.equal((await call('list_quotes',{company_id:other.id})).data.result.isError,true);
  assert.equal((await call('send_email',{})).data.result.isError,true);
  store.sql.prepare('UPDATE mcp_access_tokens SET scope=? WHERE token_hash=?').run('quotes:read',hash(token.token));assert.equal((await call('create_draft_quote',{...input,request_id:'blocked'})).data.result.isError,true);
  store.sql.prepare('DELETE FROM mcp_access_tokens WHERE token_hash=?').run(hash(token.token));assert.equal((await call('get_profile',{})).code,401);
  const second=mcp.issueAgentToken(owner.id,owner.tenant_id,'Agent membership');store.sql.prepare('UPDATE tenant_memberships SET active=0 WHERE member_id=? AND tenant_id=?').run(owner.id,owner.tenant_id);assert.equal((await call('get_profile',{},second.token)).code,401);
 }finally{store.close();fs.rmSync(dir,{recursive:true,force:true})}
});
