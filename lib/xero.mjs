import crypto from 'node:crypto';
import {hash} from './auth.mjs';
import {included,itemAmounts,totals,now} from './domain.mjs';

const fail=(message,status=400)=>Object.assign(Error(message),{status});
const json=(res,status,data)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store','Referrer-Policy':'no-referrer'});res.end(JSON.stringify(data))};
const redirect=(res,url)=>{res.writeHead(302,{Location:url,'Cache-Control':'no-store','Referrer-Policy':'no-referrer'});res.end()};
const random=()=>crypto.randomBytes(32).toString('base64url');
const API='https://api.xero.com/api.xro/2.0';
const SCOPES='offline_access accounting.invoices accounting.contacts accounting.settings.read';

// Keep internal cost/profit, signatures and private notes out of accounting payloads.
export function xeroInvoice(quote,settings,options,contactId){
 if(quote.status!=='Accepted')throw fail('Only accepted quotations can be invoiced',409);
 if(!options.accountCode||!options.taxType)throw fail('Choose a Xero sales account and tax code in company settings',409);
 if(Math.abs(Number(options.taxRate)-Number(quote.tax))>0.00001)throw fail('The Xero tax code rate does not match this quotation. Update the company Xero tax mapping.',409);
 const selected=quote.items.filter(included);if(!selected.length)throw fail('The accepted quotation has no selected items',409);
 const lines=selected.map(item=>{
  const amounts=itemAmounts(item),periods=amounts.periods;
  const details=[item.name,item.description,item.repeatUnit?`Full contract: ${periods} periods, every ${item.repeatEvery||1} ${item.repeatUnit}(s).`:null,amounts.discount?`Discount included: ${amounts.discount.toFixed(2)} ${quote.currency||settings.currency}.`:null].filter(Boolean).join('\n');
  return {Description:details.slice(0,4000),Quantity:item.qty*periods,UnitAmount:amounts.unitPrice,LineAmount:amounts.revenue,AccountCode:options.accountCode,TaxType:options.taxType};
 });
 const date=new Date().toISOString().slice(0,10),due=new Date(date+'T00:00:00Z');due.setUTCDate(due.getUTCDate()+(options.dueDays??30));
 const invoice={Type:'ACCREC',Status:'DRAFT',Contact:{ContactID:contactId},Date:date,DueDate:due.toISOString().slice(0,10),CurrencyCode:quote.currency||settings.currency,LineAmountTypes:'Exclusive',LineItems:lines,Reference:`Dowi Quote #${quote.number} | ${options.quoteURL||`${options.webURL}/${options.tenantCode}/quotes?quote=${encodeURIComponent(quote.id)}`}`.slice(0,255),Url:options.quoteURL||`${options.webURL}/${options.tenantCode}/quotes?quote=${encodeURIComponent(quote.id)}`};
 // Reporting FX rates are estimates; by default Xero chooses its accounting rate.
 if(options.useQuoteRate&&invoice.CurrencyCode!==options.baseCurrency){
  if(settings.currency!==options.baseCurrency||!(quote.exchangeRate>0))throw fail('The saved quote rate cannot be converted to this Xero base currency',409);
  invoice.CurrencyRate=Number((1/quote.exchangeRate).toPrecision(10));
 }
 return invoice;
}

export function createXero(store,auth,env=process.env,fetcher=fetch){
 const sql=store.sql,webURL=new URL(env.WEB_URL||env.PUBLIC_URL||'http://127.0.0.1:3000').origin,callback=webURL+'/auth/xero/callback';
 const key=Buffer.from(env.TOKEN_ENCRYPTION_KEY||'','base64');
 const configured=Boolean(auth.enabled&&env.XERO_CLIENT_ID&&env.XERO_CLIENT_SECRET&&key.length===32);
 sql.exec(`CREATE TABLE IF NOT EXISTS xero_flows(state_hash TEXT PRIMARY KEY,member_id TEXT NOT NULL,company_id TEXT NOT NULL,payload TEXT NOT NULL,expires INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS xero_connections(company_id TEXT PRIMARY KEY,xero_tenant_id TEXT UNIQUE NOT NULL,connection_id TEXT NOT NULL,name TEXT NOT NULL,secret TEXT NOT NULL,options TEXT NOT NULL,updated TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS xero_contacts(company_id TEXT NOT NULL,xero_tenant_id TEXT NOT NULL,contact_id TEXT NOT NULL,xero_contact_id TEXT NOT NULL,PRIMARY KEY(company_id,xero_tenant_id,contact_id));
 CREATE TABLE IF NOT EXISTS xero_invoices(company_id TEXT NOT NULL,quote_id TEXT NOT NULL,xero_tenant_id TEXT NOT NULL,status TEXT NOT NULL,invoice_id TEXT,invoice_number TEXT,payload TEXT,attempts INTEGER NOT NULL DEFAULT 0,next_attempt INTEGER NOT NULL DEFAULT 0,error TEXT,created TEXT NOT NULL,updated TEXT NOT NULL,PRIMARY KEY(company_id,quote_id));`);
 function seal(data){const iv=crypto.randomBytes(12),cipher=crypto.createCipheriv('aes-256-gcm',key,iv),encrypted=Buffer.concat([cipher.update(JSON.stringify(data)),cipher.final()]);return Buffer.concat([iv,cipher.getAuthTag(),encrypted]).toString('base64')}
 function open(secret){const raw=Buffer.from(secret,'base64'),decipher=crypto.createDecipheriv('aes-256-gcm',key,raw.subarray(0,12));decipher.setAuthTag(raw.subarray(12,28));return JSON.parse(Buffer.concat([decipher.update(raw.subarray(28)),decipher.final()]).toString())}
 sql.exec(`CREATE TABLE IF NOT EXISTS xero_invoice_history(id INTEGER PRIMARY KEY AUTOINCREMENT,company_id TEXT NOT NULL,quote_id TEXT NOT NULL,invoice_id TEXT,invoice_number TEXT,details TEXT NOT NULL,reason TEXT NOT NULL,actor TEXT NOT NULL,unlinked TEXT NOT NULL)`);
 const connection=companyId=>sql.prepare('SELECT * FROM xero_connections WHERE company_id=?').get(companyId);
 const locks=new Map();
 async function single(key,work){if(locks.has(key))return locks.get(key);const promise=work();locks.set(key,promise);try{return await promise}finally{locks.delete(key)}}
 async function requestToken(fields){
  const response=await fetcher('https://identity.xero.com/connect/token',{method:'POST',headers:{Authorization:'Basic '+Buffer.from(env.XERO_CLIENT_ID+':'+env.XERO_CLIENT_SECRET).toString('base64'),'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams(fields),signal:AbortSignal.timeout(20000)});
  if(!response.ok)throw fail('Xero authorization failed. Reconnect Xero in company settings.',401);
  const data=await response.json();if(!data.access_token||!data.refresh_token)throw fail('Xero did not grant offline access. Reconnect Xero.',401);
  return {...data,expires:Date.now()+Number(data.expires_in||1800)*1000};
 }
 async function access(companyId){return single('token:'+companyId,async()=>{
  const c=connection(companyId);if(!c)throw fail('Connect this company to Xero first',409);
  let token=open(c.secret);if(token.expires<Date.now()+60000){token=await requestToken({grant_type:'refresh_token',refresh_token:token.refresh_token});sql.prepare('UPDATE xero_connections SET secret=?,updated=? WHERE company_id=?').run(seal(token),now(),companyId)}return {c,token};
 })}
 async function api(companyId,route,{method='GET',body,idempotencyKey}={}){
  const {c,token}=await access(companyId);
  const response=await fetcher(API+route,{method,headers:{Authorization:'Bearer '+token.access_token,'Xero-tenant-id':c.xero_tenant_id,Accept:'application/json','Content-Type':'application/json',...(idempotencyKey?{'Idempotency-Key':idempotencyKey}:{})},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(25000)});
  if(!response.ok){if(response.status===401)throw fail('Xero access expired. Reconnect Xero.',401);if(response.status===429)throw fail('Xero rate limit reached. Retry later.',429);throw fail('Xero rejected the request. Check the sales account, tax code, currency and customer in Xero.',response.status>=500?502:422)}
  return response.json();
 }
 async function metadata(companyId){
  const [accounts,taxes,org,currencies]=await Promise.all([api(companyId,'/Accounts'),api(companyId,'/TaxRates'),api(companyId,'/Organisation'),api(companyId,'/Currencies')]);
  return {accounts:(accounts.Accounts||[]).filter(a=>a.Status==='ACTIVE'&&['REVENUE','SALES','OTHERINCOME'].includes(a.Type)).map(a=>({code:a.Code,name:a.Name})),taxRates:(taxes.TaxRates||[]).filter(t=>t.Status==='ACTIVE'&&t.CanApplyToRevenue!==false).map(t=>({type:t.TaxType,name:t.Name,rate:t.EffectiveRate??t.DisplayTaxRate??0})),baseCurrency:org.Organisations?.[0]?.BaseCurrency,currencies:(currencies.Currencies||[]).map(c=>c.Code)};
 }
 function invoiceStatus(companyId,quoteId){const row=sql.prepare('SELECT status,invoice_id AS invoiceId,invoice_number AS invoiceNumber,error,updated FROM xero_invoices WHERE company_id=? AND quote_id=?').get(companyId,quoteId);return row?{...row,url:row.invoiceId?'https://go.xero.com/AccountsReceivable/View.aspx?InvoiceID='+encodeURIComponent(row.invoiceId):null}:null}
 function status(companyId){const c=connection(companyId);return {configured,callbackURL:callback,connected:Boolean(c),organisation:c?{id:c.xero_tenant_id,name:c.name}:null,options:c?JSON.parse(c.options):null,jobs:sql.prepare('SELECT quote_id AS quoteId,status,invoice_id AS invoiceId,invoice_number AS invoiceNumber,error,updated FROM xero_invoices WHERE company_id=? ORDER BY updated DESC LIMIT 30').all(companyId)}}
 function enqueue(companyId,quote,{automatic=false}={}){
  if(automatic)return null;
  const c=connection(companyId);if(!c){if(automatic)return null;throw fail('Connect this company to Xero first',409)}
  const options=JSON.parse(c.options);
  if(quote.status!=='Accepted')throw fail('Only accepted quotations can be invoiced',409);
  if(!options.accountCode||!options.taxType){if(automatic)return null;throw fail('Save your Xero sales account and tax mapping first',409)}
  sql.prepare("INSERT OR IGNORE INTO xero_invoices(company_id,quote_id,xero_tenant_id,status,created,updated) VALUES(?,?,?,'Queued',?,?)").run(companyId,quote.id,c.xero_tenant_id,now(),now());
  return invoiceStatus(companyId,quote.id);
 }
 async function sync(companyId,quoteId){return single('invoice:'+companyId+':'+quoteId,async()=>{
  const job=sql.prepare('SELECT * FROM xero_invoices WHERE company_id=? AND quote_id=?').get(companyId,quoteId);if(!job||job.invoice_id)return invoiceStatus(companyId,quoteId);
  const c=connection(companyId);if(!c||c.xero_tenant_id!==job.xero_tenant_id)throw fail('The Xero organisation changed. Reconnect the original organisation before retrying.',409);
  const db=store.read(companyId),q=db.quotes.find(q=>q.id===quoteId),contact=q&&db.contacts.find(v=>v.id===q.contactId);if(!q||!contact)throw fail('The quotation or customer no longer exists',409);
  const options=JSON.parse(c.options),meta=await metadata(companyId);
  if(!meta.currencies.includes(q.currency||db.settings.currency))throw fail('Add this quotation currency in Xero before syncing.',409);
  if(meta.baseCurrency!==options.baseCurrency)throw fail('The Xero base currency changed. Save the Xero settings again.',409);
  const matchingTax=meta.taxRates.find(t=>t.type===options.taxType);if(!matchingTax||Math.abs(matchingTax.rate-options.taxRate)>0.00001||!meta.accounts.some(a=>a.code===options.accountCode))throw fail('The Xero sales account or tax mapping changed. Save the Xero settings again.',409);
  const generation=sql.prepare('SELECT count(*) n FROM xero_invoice_history WHERE company_id=? AND quote_id=?').get(companyId,quoteId).n;
  const domain=store.getDomain(companyId),quoteURL=(domain?.status==='active'?'https://'+domain.hostname:new URL(env.PUBLIC_URL||webURL).origin)+'/q/'+encodeURIComponent(q.token);
  const invoiceKey=hash(companyId+':'+quoteId+':'+generation).slice(0,40);
  let payload=job.payload?JSON.parse(job.payload):null;
  if(!payload){
   // Validate all financial fields before creating a contact in Xero.
   xeroInvoice(q,db.settings,{...options,webURL,quoteURL,tenantCode:store.company(companyId).tenantCode},'pending');
   let mapped=sql.prepare('SELECT xero_contact_id FROM xero_contacts WHERE company_id=? AND xero_tenant_id=? AND contact_id=?').get(companyId,c.xero_tenant_id,contact.id)?.xero_contact_id;
   if(!mapped){
    const contactNumber='DQ-'+hash(companyId+':'+contact.id).slice(0,24),found=await api(companyId,'/Contacts?where='+encodeURIComponent('ContactNumber=="'+contactNumber+'"'));
    mapped=found.Contacts?.[0]?.ContactID;
    if(!mapped&&contact.email){
     const candidates=await api(companyId,'/Contacts?where='+encodeURIComponent('Name=='+JSON.stringify(contact.company||contact.name)));
     const matches=(candidates.Contacts||[]).filter(c=>String(c.EmailAddress||'').trim().toLowerCase()===contact.email.trim().toLowerCase()&&c.ContactStatus!=='ARCHIVED');
     if(matches.length===1)mapped=matches[0].ContactID;
     else if((candidates.Contacts||[]).length)throw fail('A Xero customer with this name exists but could not be safely matched by email. Align the customer name and email before retrying.',409);
    }
    if(!mapped){const response=await api(companyId,'/Contacts',{method:'POST',idempotencyKey:'contact-'+contactNumber,body:{Contacts:[{Name:contact.company||contact.name,ContactNumber:contactNumber,EmailAddress:contact.email||'',FirstName:contact.name.slice(0,255)}]}});mapped=response.Contacts?.[0]?.ContactID;if(!mapped)throw fail('Xero did not create the customer. Check the customer details.',422)}
    sql.prepare('INSERT OR REPLACE INTO xero_contacts VALUES(?,?,?,?)').run(companyId,c.xero_tenant_id,contact.id,mapped);
   }
   payload=xeroInvoice(q,db.settings,{...options,webURL,quoteURL,tenantCode:store.company(companyId).tenantCode},mapped);
   // Deterministic number survives retries beyond Xero's idempotency window.
   payload.InvoiceNumber='DQ-'+store.company(companyId).tenantCode+'-'+q.number+(generation?'-R'+(generation+1):'');
   sql.prepare('UPDATE xero_invoices SET payload=? WHERE company_id=? AND quote_id=?').run(JSON.stringify(payload),companyId,quoteId);
  }
  const found=await api(companyId,'/Invoices?InvoiceNumbers='+encodeURIComponent(payload.InvoiceNumber));
  let invoice=found.Invoices?.find(i=>i.InvoiceNumber===payload.InvoiceNumber);
  if(invoice){if(invoice.Contact?.ContactID!==payload.Contact.ContactID||invoice.CurrencyCode!==payload.CurrencyCode||invoice.Reference!==payload.Reference||Math.abs(Number(invoice.Total)-totals(q).total)>0.01)throw fail('An existing Xero invoice uses this number with different details. Review it manually.',409);if(['DELETED','VOIDED'].includes(invoice.Status))throw fail('The matching Xero invoice was deleted or voided. Review it manually.',409)}
  else{
   const response=await api(companyId,'/Invoices?unitdp=4',{method:'POST',body:{Invoices:[payload]},idempotencyKey:'invoice-'+invoiceKey});invoice=response.Invoices?.[0];
   if(!invoice?.InvoiceID||invoice.HasErrors||invoice.ValidationErrors?.length)throw fail('Xero invoice validation failed. Check currency, customer, tax and account mappings.',422);
  }
  if(Math.abs(Number(invoice.Total)-totals(q).total)>0.01){sql.prepare("UPDATE xero_invoices SET status='Review required',invoice_id=?,invoice_number=?,error=?,updated=? WHERE company_id=? AND quote_id=?").run(invoice.InvoiceID,invoice.InvoiceNumber,'Xero total differs from the accepted quotation. Review the draft in Xero.',now(),companyId,quoteId);return invoiceStatus(companyId,quoteId)}
  sql.prepare("UPDATE xero_invoices SET status='Synced',invoice_id=?,invoice_number=?,error=NULL,updated=? WHERE company_id=? AND quote_id=?").run(invoice.InvoiceID,invoice.InvoiceNumber,now(),companyId,quoteId);return invoiceStatus(companyId,quoteId);
 })}
 async function route(req,res,url,b,ctx){
  const callbackRoute=url.pathname==='/auth/xero/callback';if(!callbackRoute&&!url.pathname.startsWith('/api/xero'))return false;
  if(!auth.enabled)throw fail('Xero integration requires workspace SSO',404);
  let companyId=ctx.companyId;
  if(callbackRoute){const flow=sql.prepare('SELECT company_id FROM xero_flows WHERE state_hash=? AND expires>?').get(hash(url.searchParams.get('state')||''),Date.now());if(!flow)throw fail('Xero authorization expired. Start again.',403);companyId=flow.company_id;req.workspaceTenantId=store.company(companyId)?.tenantId}
  const user=auth.requireOwner(req);
  const boundFlow=state=>{const flow=sql.prepare('SELECT * FROM xero_flows WHERE state_hash=? AND expires>?').get(hash(state||''),Date.now());if(!flow||flow.member_id!==user.id||flow.company_id!==companyId)throw fail('Xero authorization expired or belongs to another company. Start again.',403);return flow};
  if(callbackRoute){
   const state=url.searchParams.get('state'),flow=boundFlow(state),saved=open(flow.payload);if(saved.phase!=='authorize')throw fail('This Xero callback has already been used',409);
   sql.prepare('DELETE FROM xero_flows WHERE state_hash=?').run(flow.state_hash);
   if(url.searchParams.has('error')){redirect(res,webURL+'/'+store.company(companyId).tenantCode+'/settings?xero=cancelled');return true}
   const token=await requestToken({grant_type:'authorization_code',code:url.searchParams.get('code')||'',redirect_uri:callback});
   const response=await fetcher('https://api.xero.com/connections',{headers:{Authorization:'Bearer '+token.access_token},signal:AbortSignal.timeout(20000)});if(!response.ok)throw fail('Could not list your Xero organisations',502);
   const organisations=(await response.json()).filter(v=>v.tenantType==='ORGANISATION').map(v=>({id:v.id,tenantId:v.tenantId,name:v.tenantName}));if(!organisations.length)throw fail('No Xero organisation was authorized',409);
   const selection=random();sql.prepare('INSERT INTO xero_flows VALUES(?,?,?,?,?)').run(hash(selection),user.id,companyId,seal({phase:'select',token,organisations}),Date.now()+600000);
   redirect(res,webURL+'/'+store.company(companyId).tenantCode+'/settings?xero_flow='+selection);return true;
  }
  if(req.method==='GET'&&url.pathname==='/api/xero'){json(res,200,status(companyId));return true}
  if(!['GET','HEAD'].includes(req.method)){if(!req.headers['content-type']?.startsWith('application/json'))throw fail('Use application/json',415);if(req.headers.origin&&req.headers.origin!==webURL&&req.headers.origin!==new URL(env.PUBLIC_URL||webURL).origin)throw fail('Cross-origin requests are not allowed',403)}
  const historyFor=quoteId=>sql.prepare('SELECT invoice_id AS invoiceId,invoice_number AS invoiceNumber,reason,actor,unlinked FROM xero_invoice_history WHERE company_id=? AND quote_id=? ORDER BY id DESC').all(companyId,quoteId);
  const match=url.pathname.match(/^\/api\/xero\/invoices\/([a-zA-Z0-9-]+)$/);
  if(match&&req.method==='GET'){
   const q=store.read(companyId).quotes.find(q=>q.id===match[1]);if(!q)throw fail('Quote not found',404);
   const current=status(companyId);json(res,200,{invoice:invoiceStatus(companyId,q.id),history:historyFor(q.id),configured,connected:current.connected,ready:Boolean(configured&&current.connected&&current.options?.accountCode&&current.options?.taxType),settingsURL:'/'+store.company(companyId).tenantCode+'/settings?xero_setup=1'});return true;
  }
  if(!configured)throw fail('The platform administrator must configure the Xero OAuth app first',503);
  if(req.method==='POST'&&url.pathname==='/api/xero/connect'){
   const state=random();sql.prepare('DELETE FROM xero_flows WHERE expires<?').run(Date.now());sql.prepare('INSERT INTO xero_flows VALUES(?,?,?,?,?)').run(hash(state),user.id,companyId,seal({phase:'authorize'}),Date.now()+600000);
   const target=new URL('https://login.xero.com/identity/connect/authorize');for(const [k,v] of Object.entries({response_type:'code',client_id:env.XERO_CLIENT_ID,redirect_uri:callback,scope:SCOPES,state}))target.searchParams.set(k,v);json(res,200,{url:target.href});return true;
  }
  if(req.method==='GET'&&url.pathname==='/api/xero/organisations'){const flow=boundFlow(url.searchParams.get('flow')),data=open(flow.payload);if(data.phase!=='select')throw fail('Complete Xero authorization first',409);json(res,200,{organisations:data.organisations});return true}
  if(req.method==='POST'&&url.pathname==='/api/xero/select'){
   const flow=boundFlow(b.flow),data=open(flow.payload),selected=data.organisations?.find(v=>v.id===b.connectionId);if(data.phase!=='select'||!selected)throw fail('Select an authorized Xero organisation');
   const existing=connection(companyId);if(existing&&existing.xero_tenant_id!==selected.tenantId)throw fail('Disconnect the current Xero organisation first',409);
   if(sql.prepare('SELECT 1 FROM xero_connections WHERE xero_tenant_id=? AND company_id!=?').get(selected.tenantId,companyId))throw fail('This Xero organisation is already connected to a different Dowi company tenant',409);
   const historic=sql.prepare('SELECT 1 FROM xero_invoices WHERE company_id=? AND xero_tenant_id!=? LIMIT 1').get(companyId,selected.tenantId);if(historic)throw fail('This company has invoice history in another Xero organisation. Reconnect the original organisation.',409);
   sql.prepare('INSERT INTO xero_connections VALUES(?,?,?,?,?,?,?) ON CONFLICT(company_id) DO UPDATE SET connection_id=excluded.connection_id,name=excluded.name,secret=excluded.secret,updated=excluded.updated').run(companyId,selected.tenantId,selected.id,selected.name,seal(data.token),JSON.stringify({autoSync:false,dueDays:30,useQuoteRate:false}),now());sql.prepare('DELETE FROM xero_flows WHERE state_hash=?').run(flow.state_hash);json(res,200,status(companyId));return true;
  }
  if(req.method==='GET'&&url.pathname==='/api/xero/options'){json(res,200,await metadata(companyId));return true}
  if(req.method==='PUT'&&url.pathname==='/api/xero/settings'){
   const c=connection(companyId);if(!c)throw fail('Connect Xero first',409);const meta=await metadata(companyId),account=meta.accounts.find(a=>a.code===b.accountCode),tax=meta.taxRates.find(t=>t.type===b.taxType);
   if(!account||!tax)throw fail('Select an active Xero sales account and tax code');const dueDays=Number(b.dueDays);if(!Number.isInteger(dueDays)||dueDays<0||dueDays>365)throw fail('Invoice due days must be between 0 and 365');
   const options={accountCode:account.code,taxType:tax.type,taxRate:tax.rate,baseCurrency:meta.baseCurrency,dueDays,autoSync:false,useQuoteRate:b.useQuoteRate===true};sql.prepare('UPDATE xero_connections SET options=?,updated=? WHERE company_id=?').run(JSON.stringify(options),now(),companyId);json(res,200,status(companyId));return true;
  }
  if(req.method==='DELETE'&&url.pathname==='/api/xero'){
   const c=connection(companyId);if(c){const {token}=await access(companyId),response=await fetcher('https://api.xero.com/connections/'+encodeURIComponent(c.connection_id),{method:'DELETE',headers:{Authorization:'Bearer '+token.access_token},signal:AbortSignal.timeout(20000)});if(!response.ok&&response.status!==404)throw fail('Could not disconnect Xero. Try again.',502);sql.prepare('DELETE FROM xero_connections WHERE company_id=?').run(companyId);sql.prepare("UPDATE xero_invoices SET status='Failed',error='Xero disconnected',updated=? WHERE company_id=? AND status IN ('Queued','Retrying')").run(now(),companyId)}json(res,200,{connected:false});return true;
  }
  if(match&&req.method==='POST'){
   const q=store.read(companyId).quotes.find(q=>q.id===match[1]);if(!q)throw fail('Quote not found',404);
   enqueue(companyId,q);
   try{await sync(companyId,q.id)}catch(error){sql.prepare("UPDATE xero_invoices SET status='Failed',error=?,updated=? WHERE company_id=? AND quote_id=? AND invoice_id IS NULL").run(error.status?error.message:'Request interrupted. Check status or retry manually; duplicate invoices are prevented.',now(),companyId,q.id);throw error}
   json(res,200,{invoice:invoiceStatus(companyId,q.id)});return true;
  }
  if(match&&req.method==='DELETE'){
   if(!store.read(companyId).quotes.some(q=>q.id===match[1]))throw fail('Quote not found',404);
   const reason=String(b.reason||'').trim();if(!reason||reason.length>1000)throw fail('Enter an unlink reason (up to 1000 characters)');
   await single('invoice:'+companyId+':'+match[1],async()=>{
    const job=sql.prepare('SELECT * FROM xero_invoices WHERE company_id=? AND quote_id=?').get(companyId,match[1]);if(!job)return;
    if(!job.invoice_id)throw fail('Resolve the invoice request before unlinking it. Retry safely to recover its Xero ID.',409);
    const c=connection(companyId);if(!c||c.xero_tenant_id!==job.xero_tenant_id)throw fail('Reconnect the original Xero organisation before unlinking',409);
    const remote=await api(companyId,'/Invoices/'+encodeURIComponent(job.invoice_id)),invoice=remote.Invoices?.find(i=>i.InvoiceID===job.invoice_id);if(!invoice)throw fail('The linked Xero invoice was not found',409);
    const detached=await api(companyId,'/Invoices/'+encodeURIComponent(job.invoice_id),{method:'POST',body:{Invoices:[{InvoiceID:job.invoice_id,Reference:'',Url:''}]}});
    const updated=detached.Invoices?.find(i=>i.InvoiceID===job.invoice_id);if(!updated||updated.HasErrors||updated.ValidationErrors?.length||updated.Reference||updated.Url)throw fail('Xero did not clear the quotation reference. The link has been kept; review it in Xero.',409);
    sql.exec('BEGIN IMMEDIATE');try{sql.prepare('INSERT INTO xero_invoice_history(company_id,quote_id,invoice_id,invoice_number,details,reason,actor,unlinked) VALUES(?,?,?,?,?,?,?,?)').run(companyId,match[1],job.invoice_id,job.invoice_number,JSON.stringify(job),reason,user.email,now());sql.prepare('DELETE FROM xero_invoices WHERE company_id=? AND quote_id=?').run(companyId,match[1]);sql.exec('COMMIT')}catch(error){sql.exec('ROLLBACK');throw error}
   });
   json(res,200,{invoice:null,history:historyFor(match[1])});return true;
  }
  throw fail('Unsupported Xero action',405);
 }
 return {configured,status,route,enqueue,sync,invoiceStatus};
}
