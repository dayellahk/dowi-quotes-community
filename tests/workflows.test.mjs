import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {once} from 'node:events';
test('persistent quote lifecycle, optional selections, validation and internal access',async()=>{
 const dir=mkdtempSync(path.join(tmpdir(),'dowi-quotes-test-'));let server;
 async function start(){server=spawn(process.execPath,['server.mjs'],{env:{...process.env,PORT:'3101',DATA_DIR:dir,INTERNAL_PASSWORD:'test-password'},stdio:['ignore','pipe','pipe']});await Promise.race([once(server.stdout,'data'),once(server,'exit').then(()=>{throw Error('Test server failed to start')})]);}
 async function stop(){const done=once(server,'exit');server.kill();await done}
 const request=async(url,method='GET',body,auth=true)=>{const r=await fetch('http://127.0.0.1:3101'+url,{method,headers:{'Content-Type':'application/json',...(auth?{Authorization:'Basic '+Buffer.from('admin:test-password').toString('base64')}:{})},body:body?JSON.stringify(body):undefined});return {status:r.status,data:r.headers.get('content-type')?.includes('json')?await r.json():await r.text()}};
 try{await start();assert.equal((await request('/api/workspace','GET',null,false)).status,401);const {data:db}=await request('/api/workspace');
 const payload={title:'Lifecycle test',contactId:db.contacts[0].id,tax:10,expires:new Date(Date.now()+86400000).toISOString(),notes:'Test proposal',terms:'Test terms',items:[{name:'Core service',description:'',price:100,qty:2,optional:false,selected:true},{name:'Optional add-on',description:'',price:50,qty:1,optional:true,selected:true}]};
 assert.equal((await request('/api/quotes','POST',{...payload,items:[{name:'Bad',price:-1,qty:1}]})).status,400);
 const {data:q,status}=await request('/api/quotes','POST',payload);assert.equal(status,201);assert.equal(q.status,'Draft');
 assert.equal((await request('/api/shared/'+q.token,'GET',null,false)).status,404);
 assert.equal((await request('/api/quotes/'+q.id+'/status','POST',{status:'Sent'})).status,200);
 assert.equal((await request('/q/'+q.token,'GET',null,false)).status,200);
 const viewed=await request('/api/shared/'+q.token,'GET',null,false);assert.equal(viewed.data.quote.status,'Sent');await new Promise(r=>setTimeout(r,3100));await request('/api/shared/'+q.token+'/view','POST',{challenge:viewed.data.viewChallenge,visitor:'testvisitor01234567890123'},false);assert.equal((await request('/api/shared/'+q.token,'GET',null,false)).data.quote.status,'Viewed');
 assert.equal((await request('/api/shared/'+q.token+'/messages','POST',{name:'Test Customer',text:'Can we start next week?'},false)).status,200);
 const accepted=await request('/api/shared/'+q.token+'/accept','POST',{name:'Test Customer',agreed:true,comment:'Please begin next week',reference:'PO-100',selected:[]},false);assert.equal(accepted.status,200);assert.equal(accepted.data.status,'Accepted');assert.equal(accepted.data.items[0].selected,true);assert.equal(accepted.data.items[1].selected,false);
 assert.equal((await request('/api/quotes/'+q.id,'PUT',payload)).status,409);
 assert.equal((await request('/api/shared/'+q.token+'/accept','POST',{name:'Again'},false)).status,409);
 await stop();await start();const saved=(await request('/api/workspace')).data.quotes.find(x=>x.id===q.id);assert.equal(saved.acceptedBy,'Test Customer');assert.equal(saved.messages.length,1);assert.equal(saved.items[1].selected,false);
 }finally{if(server&&server.exitCode===null)await stop();rmSync(dir,{recursive:true,force:true})}
});
