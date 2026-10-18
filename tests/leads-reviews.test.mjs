import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
test('public enquiries convert to a single draft and reviews require completion and publication consent',async()=>{
 const dir=mkdtempSync(path.join(tmpdir(),'dowi-quotes-leads-'));const server=spawn(process.execPath,['server.mjs'],{env:{...process.env,PORT:'3107',DATA_DIR:dir,INTERNAL_PASSWORD:'lead-test'},stdio:['ignore','pipe','pipe']});
 const request=async(url,method='GET',body,staff=true)=>{const response=await fetch('http://127.0.0.1:3107/api/'+url,{method,headers:{'Content-Type':'application/json',...(staff?{Authorization:'Basic '+Buffer.from('admin:lead-test').toString('base64')}:{})},body:body?JSON.stringify(body):undefined});return {status:response.status,data:await response.json()}};
 try{await Promise.race([once(server.stdout,'data'),once(server,'exit').then(()=>{throw Error('Server failed')})]);
 assert.equal((await request('leads','GET',null,false)).status,401);const branding=(await request('lead-form','GET',null,false)).data;assert.equal(branding.company,'Studio North');assert.equal(branding.contacts,undefined);
 assert.equal((await request('lead-form','POST',{name:'Customer',email:'bad email',summary:'Project'},false)).status,400);
 assert.equal((await request('lead-form','POST',{name:'Test Customer',email:'lead@example.com',company:'Client',summary:'New project',details:'Details for the proposal'},false)).status,201);
 const lead=(await request('leads')).data[0];const q=(await request(`leads/${lead.id}/convert`,'POST',{})).data;const same=(await request(`leads/${lead.id}/convert`,'POST',{})).data;assert.equal(q.id,same.id);assert.equal(q.status,'Draft');assert.equal(q.items[0].description,'Details for the proposal');assert.equal((await request('workspace')).data.quotes.filter(x=>x.id===q.id).length,1);
 await request(`quotes/${q.id}/status`,'POST',{status:'Sent'});
 assert.equal((await request(`shared/${q.token}/reviews`,'POST',{name:'Customer',rating:5,text:'Great!',publishConsent:true},false)).status,409);
 await request(`shared/${q.token}/accept`,'POST',{name:'Customer',agreed:true},false);await request(`quotes/${q.id}/complete`,'POST',{});
 assert.equal((await request(`shared/${q.token}/reviews`,'POST',{name:'Customer',rating:6,text:'Invalid'},false)).status,400);
 assert.equal((await request(`shared/${q.token}/reviews`,'POST',{name:'Customer',rating:5,text:'Great work',publishConsent:true},false)).status,201);
 assert.equal((await request(`shared/${q.token}/reviews`,'POST',{name:'Customer',rating:5,text:'Duplicate'},false)).status,409);
 const r=(await request('reviews')).data[0];assert.equal((await request(`reviews/${r.id}/feature`,'POST',{featured:true})).status,200);const shared=(await request(`shared/${q.token}`,'GET',null,false)).data;assert.equal(shared.reviews[0].text,'Great work');assert.equal(shared.reviews[0].quoteId,undefined);
 const secondLeadBody={name:'Other',email:'other@example.com',summary:'Other project'};await request('lead-form','POST',secondLeadBody,false);const otherLead=(await request('leads')).data[0];const other=(await request(`leads/${otherLead.id}/convert`,'POST',{})).data;await request(`quotes/${other.id}/status`,'POST',{status:'Sent'});await request(`shared/${other.token}/accept`,'POST',{name:'Other',agreed:true},false);await request(`quotes/${other.id}/complete`,'POST',{});await request(`shared/${other.token}/reviews`,'POST',{name:'Other',rating:5,text:'PRIVATE FEEDBACK',publishConsent:false},false);const privateReview=(await request('reviews')).data[0];assert.equal((await request(`reviews/${privateReview.id}/feature`,'POST',{featured:true})).status,400);const publicReviews=(await request(`shared/${q.token}`,'GET',null,false)).data.reviews;assert.equal(JSON.stringify(publicReviews).includes('PRIVATE FEEDBACK'),false);
 }finally{if(server.exitCode===null){const done=once(server,'exit');server.kill();await done}rmSync(dir,{recursive:true,force:true})}
});
