import {createStore} from '../lib/store.mjs';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {mkdtempSync,rmSync,readFileSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {mailConfig} from '../lib/mail.mjs';
test('SMTP quote delivery publishes, hides private data, persists and prevents queued duplicates',async()=>{
 const messages=[],dir=mkdtempSync(path.join(tmpdir(),'dowi-quotes-mail-'));let child,rejectRecipient=false;
 const smtp=net.createServer(socket=>{socket.write('220 localhost QA\r\n');let buffer='',data=false,raw=[];socket.on('data',chunk=>{buffer+=chunk.toString();let n;while((n=buffer.indexOf('\r\n'))>=0){const line=buffer.slice(0,n);buffer=buffer.slice(n+2);if(data){if(line==='.') {messages.push(raw.join('\n'));raw=[];data=false;socket.write('250 accepted\r\n')}else raw.push(line);continue}if(/^EHLO|^HELO/.test(line))socket.write('250 localhost\r\n');else if(/^RCPT/.test(line)&&rejectRecipient)socket.write('550 rejected\r\n');else if(/^MAIL|^RCPT|^RSET/.test(line))socket.write('250 OK\r\n');else if(line==='DATA'){data=true;socket.write('354 send\r\n')}else if(line==='QUIT'){socket.end('221 bye\r\n')}else socket.write('500 unsupported\r\n')}})});
 await new Promise(resolve=>smtp.listen(0,'127.0.0.1',resolve));
 const api=async(url,method='GET',body)=>{const r=await fetch('http://127.0.0.1:3108/api/'+url,{method,headers:{'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});return {status:r.status,data:await r.json()}};
 const start=async(enabled=true,portal='https://quotes.example.test')=>{child=spawn(process.execPath,['server.mjs'],{env:{...process.env,PORT:'3108',DATA_DIR:dir,INTERNAL_PASSWORD:'',SMTP_HOST:enabled?'127.0.0.1':'',SMTP_PORT:String(smtp.address().port),SMTP_FROM:'sender@example.test',SMTP_USER:'',SMTP_PASS:'',PUBLIC_URL:portal},stdio:['ignore','pipe','pipe']});await Promise.race([once(child.stdout,'data'),once(child,'exit').then(()=>{throw Error('Startup failed')})])};
 const stop=async()=>{const done=once(child,'exit');child.kill();await done};
 const wait=async(check)=>{for(let i=0;i<80;i++){if(await check())return;await new Promise(r=>setTimeout(r,50))}throw Error('Delivery timeout')};
 try{
  assert.equal(mailConfig({SMTP_HOST:'smtp.example.test',SMTP_FROM:'sender@example.test'}).options.requireTLS,true);
  await start(false,'https://old.example.test');let db=(await api('workspace')).data;assert.equal(db.mailEnabled,false);const contact=(await api('contacts','POST',{name:'Mail customer',company:'Test',email:'customer@example.test'})).data;
  const q=(await api('quotes','POST',{title:'Email proposal',contactId:contact.id,tax:0,expires:new Date(Date.now()+86400000).toISOString(),items:[{name:'Service',qty:1,price:100,cost:47}]})).data;
  await api(`quotes/${q.id}/notes`,'POST',{text:'SECRET INTERNAL NOTE'});
  assert.equal((await api(`quotes/${q.id}/send-email`,'POST',{})).status,400);assert.equal((await api(`quotes/${q.id}`)).data.status,'Draft');
  await stop();await start();assert.equal((await api('workspace')).data.publicPortalURL,'https://quotes.example.test');assert.equal((await api(`quotes/${q.id}/send-email`,'POST',{})).status,202);assert.equal((await api(`quotes/${q.id}/send-email`,'POST',{})).status,400);
  await wait(async()=>((await api('workspace')).data.mailDeliveries[0]?.status==='Delivered'));
  assert.equal(messages.length,1);assert.match(messages[0],/customer@example.test/);assert.match(messages[0].replace(/=\n/g,''),new RegExp('https://quotes.example.test/q/'+q.token));assert.doesNotMatch(messages[0],/SECRET INTERNAL NOTE|cost|margin/);
  const shared=(await api(`shared/${q.token}`)).data;assert.equal(shared.mailDeliveries,undefined);assert.equal(shared.quote.mailDeliveries,undefined);
  await stop();await start();assert.equal((await api('workspace')).data.mailDeliveries[0].status,'Delivered');await new Promise(r=>setTimeout(r,600));assert.equal(messages.length,1);
  await api(`quotes/${q.id}/status`,'POST',{status:'Withdrawn'});assert.equal((await api(`quotes/${q.id}/send-email`,'POST',{})).status,400);
  await api(`quotes/${q.id}/status`,'POST',{status:'Draft'});rejectRecipient=true;assert.equal((await api(`quotes/${q.id}/send-email`,'POST',{})).status,202);
  await wait(async()=>((await api('workspace')).data.mailDeliveries[0]?.status==='Failed'));await new Promise(r=>setTimeout(r,600));assert.equal(messages.length,1,'Rejected mail must not loop or be reported as delivered');
  await stop();const file=path.join(dir,'workspace.json');db=createStore(file).read();db.mailDeliveries[0].status='Delivering';{const state=createStore(file);state.save(db);state.close()}await start();assert.equal((await api('workspace')).data.mailDeliveries[0].status,'Uncertain');assert.equal(messages.length,1);
  await stop();db=createStore(file).read();db.quotes.find(x=>x.id===q.id).status='Withdrawn';db.mailDeliveries[0].status='Queued';{const state=createStore(file);state.save(db);state.close()}await start();await wait(async()=>((await api('workspace')).data.mailDeliveries[0]?.status==='Cancelled'));assert.equal(messages.length,1);
 }finally{if(child?.exitCode===null)await stop();await new Promise(resolve=>smtp.close(resolve));rmSync(dir,{recursive:true,force:true})}
});
