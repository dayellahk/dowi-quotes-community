import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {createTurnstile,turnstileAction} from '../lib/turnstile.mjs';
const env={TURNSTILE_REQUIRED:'true',TURNSTILE_SITE_KEY:'public-key',TURNSTILE_SECRET:'private-key',TURNSTILE_HOSTNAMES:'api.quotes.example.com,customer.example.com'};
const req={headers:{host:'api.quotes.example.com'}};
const input={'cf-turnstile-response':'fresh-token'};
test('Turnstile protects every public mutation including routing aliases, excludes tracking and authenticated APIs',()=>{
 for(const [path,action] of [['lead-form','enquiry'],['shared/token/accept','quote_accept'],['shared/token/decline','quote_decline'],['shared/token/messages','quote_question'],['shared/token/reviews','quote_review'],['/shared//token/accept/','quote_accept'],['shared/token/accept/extra','quote_accept']])assert.equal(turnstileAction('POST','/api/'+path),action);
 for(const path of ['shared/token/view','shared/token/heartbeat','quotes/q/messages','auth/exchange','mcp-proposals/p/approve'])assert.equal(turnstileAction('POST','/api/'+path),null);
 assert.equal(turnstileAction('GET','/api/shared/token'),null);
});
test('Turnstile configuration fails closed in production and never exposes secret',()=>{
 assert.deepEqual(createTurnstile({}).publicConfig(),{enabled:false});
 assert.throws(()=>createTurnstile({NODE_ENV:'production'}),/requires/);
 assert.throws(()=>createTurnstile({...env,NODE_ENV:'production',TURNSTILE_HOSTNAMES:'localhost'}),/local hostnames/);
 assert.deepEqual(createTurnstile(env).publicConfig(),{enabled:true,siteKey:'public-key'});
});
test('Turnstile calls Siteverify once; requires boolean success, exact action and request hostname',async()=>{
 let calls=0,result={success:true,action:'quote_accept',hostname:'api.quotes.example.com'};
 const service=createTurnstile(env,async(url,options)=>{
  calls++;assert.equal(url,'https://challenges.cloudflare.com/turnstile/v0/siteverify');
  assert.equal(options.body.get('secret'),'private-key');assert.equal(options.body.get('response'),'fresh-token');
  return {ok:true,json:async()=>result};
 });
 await service.verify(req,input,'quote_accept');assert.equal(calls,1);
 for(const bad of [{},{'cf-turnstile-response':' '},{'cf-turnstile-response':'x'.repeat(2049)}])await assert.rejects(service.verify(req,bad,'quote_accept'),{status:403});
 assert.equal(calls,1);
 for(const failure of [{success:false},{success:'true',action:'quote_accept',hostname:'api.quotes.example.com'},{success:true,action:'quote_review',hostname:'api.quotes.example.com'},{success:true,action:'quote_accept',hostname:'customer.example.com'},{success:true,action:'quote_accept',hostname:'attacker.example'}]){
  result=failure;await assert.rejects(service.verify(req,input,'quote_accept'),{status:403});
 }
 await assert.rejects(service.verify({headers:{host:'attacker.example'}},input,'quote_accept'),{status:503});
});
test('Turnstile rejects service failures and reused or expired tokens',async()=>{
 for(const request of [async()=>{throw Error('offline')},async()=>({ok:false}),async()=>({ok:true,json:async()=>{throw Error('invalid JSON')}})])await assert.rejects(createTurnstile(env,request).verify(req,input,'enquiry'),{status:503});
 const used=new Set();const service=createTurnstile(env,async(_url,options)=>{const token=options.body.get('response');const success=!used.has(token);used.add(token);return {ok:true,json:async()=>({success,action:'enquiry',hostname:'api.quotes.example.com'})}});
 await service.verify(req,input,'enquiry');await assert.rejects(service.verify(req,input,'enquiry'),{status:403});
});
test('one-time token claims reject concurrent replays even when Siteverify repeatedly returns success',async()=>{
 const sql=new DatabaseSync(':memory:');let release;
 const gate=new Promise(resolve=>release=resolve);
 const request=async()=>{await gate;return {ok:true,json:async()=>({success:true,action:'enquiry',hostname:'api.quotes.example.com'})}};
 try{
  const first=createTurnstile(env,request,sql),second=createTurnstile(env,request,sql);
  const pending=[first.verify(req,input,'enquiry'),second.verify(req,input,'enquiry')];release();
  const results=await Promise.allSettled(pending);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(results.find(r=>r.status==='rejected').reason.status,403);
  await assert.rejects(createTurnstile(env,request,sql).verify(req,input,'enquiry'),{status:403});
  const stored=sql.prepare('SELECT * FROM turnstile_redemptions').all();assert.equal(stored.length,1);assert.match(stored[0].token_hash,/^[a-f0-9]{64}$/);assert.equal(JSON.stringify(stored).includes('fresh-token'),false);
 }finally{sql.close()}
});
