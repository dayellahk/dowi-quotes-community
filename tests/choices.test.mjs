import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
test('multiple-choice groups price one alternative and enforce one customer selection',async()=>{
 const dir=mkdtempSync(path.join(tmpdir(),'dowi-quotes-choices-'));
 const server=spawn(process.execPath,['server.mjs'],{env:{...process.env,PORT:'3104',DATA_DIR:dir,INTERNAL_PASSWORD:''},stdio:['ignore','pipe','pipe']});
 const req=async(url,method='GET',body)=>{const r=await fetch('http://127.0.0.1:3104/api/'+url,{method,headers:{'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});return {status:r.status,data:await r.json()}};
 try{await Promise.race([once(server.stdout,'data'),once(server,'exit').then(()=>{throw Error('Server failed')})]);const db=(await req('workspace')).data;const q=(await req('quotes','POST',{title:'Choose support',contactId:db.contacts[0].id,tax:10,expires:new Date(Date.now()+86400000).toISOString(),items:[{name:'Setup',price:100,cost:40,qty:1},{id:'reused-library-item',name:'Standard',price:50,cost:10,qty:1,choiceGroup:'Support'},{id:'reused-library-item',name:'Premium',price:80,cost:20,qty:1,choiceGroup:'Support'}]})).data;
 assert.equal(new Set(q.items.map(i=>i.id)).size,3,'Repeated library items have unique quote item IDs');assert.equal(q.items[1].selected,true);assert.equal(q.items[2].selected,false);await req(`quotes/${q.id}/status`,'POST',{status:'Sent'});
 assert.equal((await req(`shared/${q.token}/accept`,'POST',{name:'Customer',agreed:true,selected:[1,2]})).status,400);
 assert.equal((await req(`shared/${q.token}/accept`,'POST',{name:'Customer',agreed:true,selected:[]})).status,400);
 const accepted=await req(`shared/${q.token}/accept`,'POST',{name:'Customer',agreed:true,selected:[2]});assert.equal(accepted.status,200);assert.equal(accepted.data.items[0].selected,true);assert.equal(accepted.data.items[1].selected,false);assert.equal(accepted.data.items[2].selected,true);assert.equal(accepted.data.items[2].cost,undefined);
 }finally{if(server.exitCode===null){const done=once(server,'exit');server.kill();await done}rmSync(dir,{recursive:true,force:true})}
});
