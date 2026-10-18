import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {mkdtempSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';

test('public routes enforce Turnstile before mutating data, without challenging reads or staff APIs',async()=>{
 const dir=mkdtempSync(path.join(tmpdir(),'dowi-turnstile-'));
 const mock=path.join(dir,'siteverify.mjs');
 writeFileSync(mock,`const used=new Set();globalThis.fetch=async(url,options)=>{if(url!=='https://challenges.cloudflare.com/turnstile/v0/siteverify')throw Error('Unexpected outbound request');const token=options.body.get('response'),[action,unique]=token.split(':');const success=Boolean(unique)&&!used.has(token);used.add(token);return {ok:true,json:async()=>({success,action,hostname:'127.0.0.1'})}};`);
 const child=spawn(process.execPath,['--import',mock,'server.mjs'],{env:{...process.env,NODE_ENV:'test',HOST:'127.0.0.1',PORT:'3197',DATA_DIR:dir,AUTH_MODE:'',INTERNAL_PASSWORD:'test-only',TURNSTILE_REQUIRED:'true',TURNSTILE_SITE_KEY:'site-key',TURNSTILE_SECRET:'secret-key',TURNSTILE_HOSTNAMES:'127.0.0.1'},stdio:['ignore','pipe','pipe']});
 const request=async(url,method='GET',body,staff=false)=>{const r=await fetch('http://127.0.0.1:3197'+url,{method,headers:{'Content-Type':'application/json',...(staff?{Authorization:'Basic '+Buffer.from('admin:test-only').toString('base64')}:{})},body:body?JSON.stringify(body):undefined});return {status:r.status,data:await r.json()}};
 try{
  await Promise.race([once(child.stdout,'data'),once(child,'exit').then(()=>{throw Error('Server failed')})]);
  const db=(await request('/api/workspace','GET',undefined,true)).data;
  const q=db.quotes.find(q=>q.status==='Sent');
  const shared=await request('/api/shared/'+q.token);assert.equal(shared.status,200);assert.equal(shared.data.turnstile.siteKey,'site-key');assert(!JSON.stringify(shared.data).includes('secret-key'));
  assert.equal((await request('/api/lead-form')).data.turnstile.enabled,true);
  for(const action of ['accept','decline','messages','reviews'])for(const suffix of ['', '/', '/extra'])assert.equal((await request('/api/shared/'+q.token+'/'+action+suffix,'POST',{})).status,403);
  assert.equal((await request('/api//shared//'+q.token+'/accept','POST',{})).status,403);
  assert.equal((await request('/api/lead-form/','POST',{})).status,403);
  assert.equal((await request('/api/shared/'+q.token+'/view','POST',{challenge:'missing',visitor:'browseridentity0123456789'})).status,400);
  const message={name:'QA',text:'Verified question','cf-turnstile-response':'quote_question:one'};
  assert.equal((await request('/api/shared/'+q.token+'/messages','POST',message)).status,200);
  assert.equal((await request('/api/shared/'+q.token+'/messages','POST',message)).status,403);
  assert.equal((await request('/api/shared/'+q.token+'/accept','POST',{name:'QA',agreed:true,'cf-turnstile-response':'quote_question:wrong-action'})).status,403);
  const final=(await request('/api/workspace','GET',undefined,true)).data.quotes.find(x=>x.id===q.id);assert.equal(final.status,'Sent');assert.equal(final.messages.length,q.messages.length+1);
  const lead={name:'QA',email:'qa@example.com',summary:'Turnstile QA','cf-turnstile-response':'enquiry:one'};
  assert.equal((await request('/api/lead-form','POST',lead)).status,201);assert.equal((await request('/api/lead-form','POST',lead)).status,403);
 }finally{if(child.exitCode===null){const done=once(child,'exit');child.kill();await done}rmSync(dir,{recursive:true,force:true})}
});
