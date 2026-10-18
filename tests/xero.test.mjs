import {test} from 'node:test';import assert from 'node:assert/strict';import crypto from 'node:crypto';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {createStore} from '../lib/store.mjs';import {createAuth,hash} from '../lib/auth.mjs';import {createXero,xeroInvoice} from '../lib/xero.mjs';import {createIndependentCompany} from '../lib/tenancy.mjs';
const quote=()=>({id:'quote-xero',number:1001,title:'TEST accounting',status:'Accepted',currency:'USD',exchangeRate:7.8,tax:0,items:[{id:'a',name:'Service',description:'Customer-facing',qty:2,price:100,cost:42,selected:true,discountType:'percent',discountValue:10,repeatUnit:'month',repeatCount:3,repeatEvery:1},{id:'b',name:'Optional omitted',qty:1,price:500,cost:100,optional:true,selected:false}],privateNotes:[{text:'Secret margin'}]});
const settings={company:'Dowi QA',currency:'HKD'};
const options={accountCode:'200',taxType:'NONE',taxRate:0,baseCurrency:'HKD',webURL:'https://app.example.com',tenantCode:'10001',dueDays:30};
test('Xero maps selected discounted full-contract quantities, protects costs and inverts only explicitly enabled FX',()=>{
 const q=quote(),invoice=xeroInvoice(q,settings,options,'contact-xero');assert.equal(invoice.Status,'DRAFT');assert.match(invoice.Reference,/Dowi Quote #1001/);assert.match(invoice.Reference,/https:/);assert.match(invoice.Url,/quote=quote-xero/);assert.equal(invoice.Type,'ACCREC');assert.equal(invoice.LineItems.length,1);assert.equal(invoice.LineItems[0].Quantity,6);assert.equal(invoice.LineItems[0].UnitAmount,90);assert.equal(invoice.LineItems[0].LineAmount,540);assert.equal(invoice.CurrencyRate,undefined);assert(!JSON.stringify(invoice).includes('Secret margin'));assert(!JSON.stringify(invoice).includes('cost'));
 assert.equal(xeroInvoice(q,settings,{...options,useQuoteRate:true},'contact-xero').CurrencyRate,Number((1/7.8).toPrecision(10)));
 assert.throws(()=>xeroInvoice({...q,status:'Draft'},settings,options,'c'),/accepted/);assert.throws(()=>xeroInvoice({...q,tax:5},settings,options,'c'),/tax code/);assert.throws(()=>xeroInvoice(q,settings,{...options,useQuoteRate:true,baseCurrency:'GBP'},'c'),/base currency/);
});
test('Xero OAuth is owner/company bound, encrypts tokens, queues idempotently and recovers a lost invoice response',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'dowi-xero-')),store=createStore(path.join(dir,'workspace.json'));
 try{
  const env={AUTH_MODE:'oidc',OWNER_EMAIL:'owner@example.com',PUBLIC_URL:'https://api.example.com',WEB_URL:'https://app.example.com',TOKEN_ENCRYPTION_KEY:crypto.randomBytes(32).toString('base64'),XERO_CLIENT_ID:'client-test',XERO_CLIENT_SECRET:'secret-test'};
  const auth=createAuth(store.sql,env),owner=store.sql.prepare('SELECT * FROM members').get(),session='session-test';store.sql.prepare('INSERT INTO sessions VALUES(?,?,?)').run(hash(session),owner.id,Date.now()+60000);
  const company=store.defaultCompanyId,other=createIndependentCompany(store,owner.id,{company:'Other',currency:'HKD'});let created=0,contactPosts=0,lostResponse=true,remoteInvoice=null,matchExisting=false,tokenRequests=0,rejectUnlink=false;
  const response=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json'}});
  const fetcher=async(url,request={})=>{
   const u=new URL(url);
   if(u.pathname==='/connect/token'){tokenRequests++;return response({access_token:'private-access',refresh_token:'private-refresh',expires_in:1800})}
   if(u.pathname==='/connections')return response([{id:'connection-xero',tenantId:'organisation-xero',tenantName:'Dowi Test Organisation',tenantType:'ORGANISATION'}]);
   assert.equal(request.headers['Xero-tenant-id'],'organisation-xero');
   if(u.pathname.endsWith('/Accounts'))return response({Accounts:[{Code:'200',Name:'Sales',Status:'ACTIVE',Type:'REVENUE'}]});
   if(u.pathname.endsWith('/TaxRates'))return response({TaxRates:[{TaxType:'NONE',Name:'No tax',Status:'ACTIVE',EffectiveRate:0,CanApplyToRevenue:true}]});
   if(u.pathname.endsWith('/Organisation'))return response({Organisations:[{BaseCurrency:'HKD'}]});
   if(u.pathname.endsWith('/Currencies'))return response({Currencies:[{Code:'HKD'},{Code:'USD'}]});
   if(u.pathname.endsWith('/Contacts')){if(request.method==='POST'){contactPosts++;return response({Contacts:[{ContactID:'contact-xero'}]})}return response({Contacts:matchExisting&&u.searchParams.get('where')?.startsWith('Name==')?[{ContactID:'existing-contact-xero',EmailAddress:'existing@example.com',ContactStatus:'ACTIVE'}]:[]})}
   if(u.pathname.endsWith('/Invoices/invoice-xero')){
    if(request.method==='POST'){if(rejectUnlink)return response({Message:'Rejected'},400);const update=JSON.parse(request.body).Invoices[0];assert.deepEqual(Object.keys(update).sort(),['InvoiceID','Reference','Url']);remoteInvoice={...remoteInvoice,...update};}
    return response({Invoices:[remoteInvoice]});
   }
   if(u.pathname.endsWith('/Invoices')){
    if(request.method==='POST'){created++;assert(request.headers['Idempotency-Key']);const invoice=JSON.parse(request.body).Invoices[0];remoteInvoice={...invoice,InvoiceID:'invoice-xero',Total:540};if(lostResponse){lostResponse=false;throw Error('connection reset after create')}return response({Invoices:[remoteInvoice]})}
    return response({Invoices:remoteInvoice?[remoteInvoice]:[]});
   }
   throw Error('Unexpected Xero route '+url);
  };
  const xero=createXero(store,auth,env,fetcher);
  const invoke=async(method,url,body={},companyId=company)=>{const req={method,url,workspaceTenantId:store.company(companyId).tenantId,headers:{cookie:'dowi_session='+session,'content-type':'application/json'}},res={headers:{},writeHead(code,headers){this.code=code;this.headers=headers},end(data){this.data=data?JSON.parse(data):null}};await xero.route(req,res,new URL(url,env.WEB_URL),body,{companyId});return res};
  const start=await invoke('POST','/api/xero/connect'),state=new URL(start.data.url).searchParams.get('state');assert(new URL(start.data.url).searchParams.get('scope').includes('accounting.invoices'));
  // Callback restores the original company rather than trusting current selection.
  const callback=await invoke('GET','/auth/xero/callback?state='+state+'&code=test-code',{},other.id);const flow=new URL(callback.headers.Location).searchParams.get('xero_flow');assert(flow);
  await assert.rejects(()=>invoke('GET','/api/xero/organisations?flow='+flow,{},other.id),/another company/);
  await invoke('POST','/api/xero/select',{flow,connectionId:'connection-xero'});
  assert(!store.sql.prepare('SELECT secret FROM xero_connections').get().secret.includes('private-access'));
  await assert.rejects(()=>invoke('GET','/auth/xero/callback?state='+state+'&code=test-code'),/expired/);
  await invoke('PUT','/api/xero/settings',{accountCode:'200',taxType:'NONE',dueDays:14,autoSync:true,useQuoteRate:false});
  assert.equal(xero.status(company).options.autoSync,false,'Automatic sync cannot be enabled');
  const db=store.read();const q={...quote(),contactId:db.contacts[0].id};db.quotes.unshift(q);store.save(db);
  assert.equal(xero.enqueue(company,q,{automatic:true}),null);assert.equal(store.sql.prepare('SELECT count(*) n FROM xero_invoices').get().n,0);
  xero.enqueue(company,q);xero.enqueue(company,q);assert.equal(store.sql.prepare('SELECT count(*) n FROM xero_invoices').get().n,1);
  const clock=Date.now;Date.now=()=>clock()+3600000;
  try{await assert.rejects(()=>xero.sync(company,q.id),/connection reset/)}finally{Date.now=clock}
  assert.equal(tokenRequests,2,'Parallel metadata requests must refresh the token only once');assert.equal(created,1);
  await xero.sync(company,q.id);await xero.sync(company,q.id);assert.equal(created,1);assert.equal(contactPosts,1);assert.equal(xero.invoiceStatus(company,q.id).invoiceId,'invoice-xero');assert.equal(xero.invoiceStatus(company,q.id).status,'Synced');assert.equal(xero.status(other.id).jobs.length,0);
  rejectUnlink=true;await assert.rejects(()=>invoke('DELETE','/api/xero/invoices/'+q.id,{reason:'Cancellation test'}),/rejected/);assert.equal(xero.invoiceStatus(company,q.id).invoiceId,'invoice-xero');assert.equal(store.sql.prepare('SELECT count(*) n FROM xero_invoice_history').get().n,0);rejectUnlink=false;
  await assert.rejects(()=>invoke('DELETE','/api/xero/invoices/'+q.id,{reason:'Wrong tenant'},other.id),/not found/);
  const oldInvoice=remoteInvoice;await assert.rejects(()=>invoke('DELETE','/api/xero/invoices/'+q.id,{reason:''}),/reason/);
  await invoke('DELETE','/api/xero/invoices/'+q.id,{reason:'Customer cancelled order'});assert.equal(remoteInvoice.Status,'DRAFT');assert.equal(remoteInvoice.Total,540);assert.equal(remoteInvoice.Reference,'');assert.equal(remoteInvoice.Url,'');assert.equal(xero.invoiceStatus(company,q.id),null);
  const unlinked=await invoke('GET','/api/xero/invoices/'+q.id);assert.equal(unlinked.data.history.length,1);assert.equal(unlinked.data.history[0].reason,'Customer cancelled order');
  remoteInvoice=null;const recreated=await invoke('POST','/api/xero/invoices/'+q.id);assert.equal(recreated.code,200);assert.equal(remoteInvoice.InvoiceNumber,oldInvoice.InvoiceNumber+'-R2');assert.equal(created,2);assert.equal(remoteInvoice.Status,'DRAFT');
  const fresh=store.read(),q2={...quote(),id:'second-quote',number:1002,contactId:'existing-client'};fresh.contacts.push({id:'existing-client',name:'Existing customer',company:'Existing Ltd',email:'existing@example.com'});fresh.quotes.push(q2);store.save(fresh);matchExisting=true;remoteInvoice=null;xero.enqueue(company,q2);await xero.sync(company,q2.id);assert.equal(created,3);assert.equal(contactPosts,1);assert.equal(remoteInvoice.Contact.ContactID,'existing-contact-xero');
  const member=crypto.randomUUID();store.sql.prepare("INSERT INTO members VALUES(?,?,'member',1,?)").run(member,'member@example.com',owner.tenant_id);store.sql.prepare("INSERT INTO tenant_memberships VALUES(?,?,'member',1)").run(member,owner.tenant_id);store.sql.prepare('INSERT INTO sessions VALUES(?,?,?)').run(hash('member-session'),member,Date.now()+60000);
  await assert.rejects(()=>xero.route({method:'GET',headers:{cookie:'dowi_session=member-session'},workspaceTenantId:owner.tenant_id},{},new URL('/api/xero',env.WEB_URL),{},{companyId:company}),/Administrator/);
 }finally{store.close();fs.rmSync(dir,{recursive:true,force:true})}
});
test('Accepted quote invoice request status stays available before platform setup, while writes remain blocked',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'dowi-xero-setup-')),store=createStore(path.join(dir,'workspace.json'));
 try{
  const env={AUTH_MODE:'oidc',OWNER_EMAIL:'owner@example.com',PUBLIC_URL:'https://api.example.com',WEB_URL:'https://app.example.com',TOKEN_ENCRYPTION_KEY:crypto.randomBytes(32).toString('base64')};
  const auth=createAuth(store.sql,env),owner=store.sql.prepare('SELECT * FROM members').get();store.sql.prepare('INSERT INTO sessions VALUES(?,?,?)').run(hash('setup-session'),owner.id,Date.now()+60000);
  const db=store.read();db.quotes.unshift(quote());store.save(db);const xero=createXero(store,auth,env);
  const invoke=async(method,id)=>{const req={method,workspaceTenantId:owner.tenant_id,headers:{cookie:'dowi_session=setup-session','content-type':'application/json'}},res={writeHead(s){this.status=s},end(s){this.data=JSON.parse(s)}};await xero.route(req,res,new URL('/api/xero/invoices/'+id,env.WEB_URL),{},{companyId:store.defaultCompanyId});return res};
  const r=await invoke('GET','quote-xero');assert.equal(r.status,200);assert.equal(r.data.configured,false);assert.equal(r.data.ready,false);assert.equal(r.data.invoice,null);assert.match(r.data.settingsURL,/\/10001\/settings\?xero_setup=1/);
  await assert.rejects(()=>invoke('POST','quote-xero'),{status:503});await assert.rejects(()=>invoke('GET','unknown-quote'),{status:404});assert.equal(store.sql.prepare('SELECT count(*) n FROM xero_invoices').get().n,0);
 }finally{store.close();fs.rmSync(dir,{recursive:true,force:true})}
});
