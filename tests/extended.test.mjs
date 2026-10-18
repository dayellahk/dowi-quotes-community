import {test} from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import crypto from 'node:crypto';
import {spawn} from 'node:child_process';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {once} from 'node:events';
const pause=ms=>new Promise(r=>setTimeout(r,ms));
async function until(check){for(let n=0;n<200;n++){if(await check())return;await pause(25)}throw Error('Timed out waiting for delivery')}
test('customer privacy, lifecycle, concurrency and real signed webhook retries/replay',async()=>{
 const dir=mkdtempSync(path.join(tmpdir(),'dowi-quotes-extended-'));let processServer;let fail=false;const received=[];
 const receiver=http.createServer(async(req,res)=>{let raw='';for await(const c of req)raw+=c;received.push({raw,headers:req.headers});res.writeHead(fail?500:200);res.end('ok')});receiver.listen(0,'127.0.0.1');await once(receiver,'listening');
 const req=async(url,method='GET',body)=>{const response=await fetch('http://127.0.0.1:3102/api/'+url,{method,headers:{'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});return {status:response.status,data:await response.json()}};
 try{
  processServer=spawn(process.execPath,['server.mjs'],{env:{...process.env,PORT:'3102',DATA_DIR:dir,INTERNAL_PASSWORD:'',PUBLIC_URL:'https://canonical.example.test/portal/',WEBHOOK_RETRY_MS:'30',WEBHOOK_POLL_MS:'10'},stdio:['ignore','pipe','pipe']});await Promise.race([once(processServer.stdout,'data'),once(processServer,'exit').then(()=>{throw Error('Server failed')})]);
  const db=(await req('workspace')).data;const secret='integration-test-secret';
  assert.equal((await req('webhooks','PUT',{url:`http://127.0.0.1:${receiver.address().port}/events`,baseURL:'http://127.0.0.1:3102',secret,enabled:true,events:['quote_sent','customer_viewed','customer_question','quote_accepted','quote_completed','quote_declined']})).status,200);
  const payload={title:'Privacy test',contactId:db.contacts[0].id,tax:10,expires:new Date(Date.now()+86400000).toISOString(),notes:'Customer intro',terms:'Terms',items:[{name:'Service',description:'Detail',price:200,cost:50,qty:1},{name:'Optional',price:100,cost:20,qty:1,optional:true,selected:true}]};
  const q=(await req('quotes','POST',payload)).data;await req(`quotes/${q.id}/notes`,'POST',{text:'CONFIDENTIAL COST NOTE'});await req(`quotes/${q.id}/status`,'POST',{status:'Sent'});
  assert.equal((await req(`quotes/${q.id}`,'PUT',payload)).status,409);
  const jobs=Array.from({length:8},(_,n)=>req(`quotes/${q.id}/messages`,'POST',{text:`Staff reply ${n}`}));await Promise.all(jobs);
  let saved=(await req('workspace')).data.quotes.find(x=>x.id===q.id);assert.equal(saved.messages.length,8,'Concurrent writes must not overwrite replies');
  await req(`quotes/${q.id}/followups`,'POST',{due:new Date().toISOString(),text:'INTERNAL FOLLOWUP'});
  const shared=(await req('shared/'+q.token)).data;assert.equal(shared.quote.status,'Sent');await new Promise(r=>setTimeout(r,3100));await req('shared/'+q.token+'/view','POST',{challenge:shared.viewChallenge,visitor:'testvisitor01234567890123'});assert.equal(shared.quote.items[0].cost,undefined);assert.equal(shared.quote.privateNotes,undefined);assert.equal(shared.quote.followups,undefined);assert.equal(shared.quote.activity,undefined);assert.equal(shared.quote.token,undefined);assert.equal(JSON.stringify(shared).includes('CONFIDENTIAL'),false);
  await req('shared/'+q.token);await req('shared/'+q.token);
  assert.equal((await req(`shared/${q.token}/accept`,'POST',{name:'Customer',selected:[1]})).status,400,'Acceptance requires agreement');
  const accepted=await req(`shared/${q.token}/accept`,'POST',{name:'Customer',agreed:true,comment:'Thank you',reference:'PO-42',selected:[]});assert.equal(accepted.data.acceptance.reference,'PO-42');assert.equal(accepted.data.items[1].selected,false);assert.equal(accepted.data.items[0].cost,undefined);
  assert.equal((await req(`quotes/${q.id}/complete`,'POST',{})).status,200);assert.equal((await req(`quotes/${q.id}/complete`,'POST',{})).status,409);
  const copy=(await req(`quotes/${q.id}/duplicate`,'POST',{})).data;assert.equal(copy.status,'Draft');assert.equal(copy.acceptance,undefined);assert.equal(copy.messages.length,0);await req(`quotes/${copy.id}/status`,'POST',{status:'Sent'});await req(`quotes/${copy.id}/status`,'POST',{status:'Draft'});assert.equal((await req(`shared/${copy.token}`)).status,404);await req(`quotes/${copy.id}/status`,'POST',{status:'Sent'});assert.equal((await req(`shared/${copy.token}/decline`,'POST',{name:'Customer',comment:'Timeline changed'})).status,200);assert.equal((await req(`shared/${copy.token}/accept`,'POST',{name:'Customer',agreed:true})).status,409);
  await until(async()=>{const {data}=await req('webhooks');return data.deliveries.length>=6&&data.deliveries.every(d=>d.status==='Delivered')});
  const deliveries=(await req('webhooks')).data.deliveries;assert.equal(deliveries.filter(d=>d.event==='customer_viewed').length,1,'View event is deduplicated');assert.equal(deliveries.filter(d=>d.quoteId===copy.id&&d.event==='quote_sent').length,1,'Only initial publishing emits sent');
  for(const receipt of received){assert.equal(receipt.headers['x-dowi-quotes-signature'],'sha256='+crypto.createHmac('sha256',secret).update(receipt.raw).digest('hex'));assert.equal(JSON.stringify(JSON.parse(receipt.raw)).includes('CONFIDENTIAL'),false)}
  const acceptanceDelivery=deliveries.find(d=>d.event==='quote_accepted');assert.equal(acceptanceDelivery.payload.quote_url,'https://canonical.example.test/portal/q/'+q.token);assert.equal(acceptanceDelivery.payload.selected_items.length,1);assert.equal(acceptanceDelivery.payload.total_includes_tax,220);
  fail=true;const testDelivery=(await req('webhooks/test','POST',{event:'quote_sent'})).data;await until(async()=>{const {data}=await req('webhooks');return data.config.paused});const failed=(await req('webhooks')).data.deliveries.find(d=>d.id===testDelivery.id);assert.equal(failed.status,'Failed');assert.equal(failed.attempts,4);
  fail=false;const replay=(await req('webhooks/replay','POST',{id:failed.id})).data;await until(async()=>{const {data}=await req('webhooks');return data.deliveries.find(d=>d.id===replay.id)?.status==='Delivered'});assert.equal(replay.payload.event_id,failed.payload.event_id,'Replays retain event identity for deduplication');
 }finally{if(processServer&&processServer.exitCode===null){const done=once(processServer,'exit');processServer.kill();await done}await new Promise(resolve=>receiver.close(resolve));rmSync(dir,{recursive:true,force:true})}
});
