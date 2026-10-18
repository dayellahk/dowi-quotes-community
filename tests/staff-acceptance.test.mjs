import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
test('staff acceptance requires authorization, valid selections and an open quote, with private audit evidence',async()=>{
 const dir=mkdtempSync(path.join(tmpdir(),'dowi-quotes-staff-accept-'));
 const server=spawn(process.execPath,['server.mjs'],{env:{...process.env,PORT:'3109',DATA_DIR:dir,INTERNAL_USER:'staff',INTERNAL_PASSWORD:'accept-test',SMTP_HOST:''},stdio:['ignore','pipe','pipe']});
 const api=async(url,method='GET',body,auth=true)=>{const r=await fetch('http://127.0.0.1:3109/api/'+url,{method,headers:{'Content-Type':'application/json',...(auth?{Authorization:'Basic '+Buffer.from('staff:accept-test').toString('base64')}:{})},body:body?JSON.stringify(body):undefined});return {status:r.status,data:await r.json()}};
 try{await Promise.race([once(server.stdout,'data'),once(server,'exit').then(()=>{throw Error('Startup failed')})]);const db=(await api('workspace')).data;
  const q=(await api('quotes','POST',{title:'Authorized customer acceptance',contactId:db.contacts[0].id,tax:0,expires:new Date(Date.now()+86400000).toISOString(),items:[{name:'Basic',qty:1,price:100,choiceGroup:'Service'},{name:'Premium',qty:1,price:200,choiceGroup:'Service'},{name:'Optional',qty:1,price:50,optional:true}]})).data;
  const payload={name:'Customer',authorized:true,agreed:true,evidence:'PRIVATE APPROVAL EMAIL',reference:'PO-123',selected:[1,2]};
  assert.equal((await api(`quotes/${q.id}/accept-on-behalf`,'POST',payload)).status,409);
  await api(`quotes/${q.id}/status`,'POST',{status:'Sent'});
  assert.equal((await api(`quotes/${q.id}/accept-on-behalf`,'POST',payload,false)).status,401);
  for(const invalid of [{...payload,authorized:false},{...payload,evidence:''},{...payload,agreed:false},{...payload,selected:[0,1]}])assert.equal((await api(`quotes/${q.id}/accept-on-behalf`,'POST',invalid)).status,400);
  assert.equal((await api(`quotes/${q.id}`)).data.status,'Sent');
  const accepted=(await api(`quotes/${q.id}/accept-on-behalf`,'POST',payload)).data;assert.equal(accepted.status,'Accepted');assert.equal(accepted.acceptance.recordedByTeam,true);assert.equal(accepted.acceptance.reference,'PO-123');assert.equal(accepted.items[0].selected,false);assert.equal(accepted.items[1].selected,true);assert.match(JSON.stringify(accepted.activity),/PRIVATE APPROVAL EMAIL/);
  const publicResponse=await api(`shared/${q.token}`,'GET',undefined,false);assert.equal(publicResponse.data.quote.acceptance.recordedByTeam,true);assert.doesNotMatch(JSON.stringify(publicResponse.data),/PRIVATE APPROVAL EMAIL|Acceptance recorded by staff/);
  assert.equal((await api(`quotes/${q.id}/accept-on-behalf`,'POST',payload)).status,409);assert.equal((await api(`quotes/${q.id}`,'PUT',{...q,title:'Changed'})).status,409);
 }finally{if(server.exitCode===null){const done=once(server,'exit');server.kill();await done}rmSync(dir,{recursive:true,force:true})}
});
