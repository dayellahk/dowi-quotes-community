import {tenantTeam,quoteOwner} from './lib/quote-owners.mjs';
import {securityHeaders} from './lib/security.mjs';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {AsyncLocalStorage} from 'node:async_hooks';
import {fileURLToPath} from 'node:url';
import {createStore} from './lib/store.mjs';
import {createAuth} from './lib/auth.mjs';
import {editionStatus} from './lib/edition.mjs';
import {memberCompanies,createIndependentCompany} from './lib/tenancy.mjs';
import {createTracking} from './lib/tracking.mjs';
import {objectStorage} from './lib/object-storage.mjs';
import {now,id,text,number,lineItem,acceptQuote,quoteFields,settingsFields,contactFields,publicQuote,publicSettings,activity,events,uniqueItems,normalizeChoices} from './lib/domain.mjs';
import {leadFields,convertLead,reviewFields,publicReviews} from './lib/leads.mjs';
import {saveAsset,assetMetadata,sendAsset} from './lib/assets.mjs';
import {webhookConfig,enqueue,startWebhookWorker} from './lib/webhooks.mjs';
import {normalizePortalURL} from './lib/urls.mjs';
import {mailConfig,queueQuoteEmail,startMailWorker} from './lib/mail.mjs';
import {createBackup} from './lib/backup.mjs';
import {createExchange} from './lib/exchange.mjs';
import {createCustomDomains} from './lib/custom-domains.mjs';
import {createMCP} from './lib/mcp.mjs';
import {createXero} from './lib/xero.mjs';
import {createTurnstile,turnstileAction} from './lib/turnstile.mjs';
let smtp=mailConfig();
const configuredPortalURL=process.env.PUBLIC_URL?normalizePortalURL(process.env.PUBLIC_URL):'';
const webURL=process.env.WEB_URL?normalizePortalURL(process.env.WEB_URL):'';
function portalURL(db,req){const domain=store.getDomain(activeCompany());if(domain?.status==='active')return `https://${domain.hostname}`;return configuredPortalURL||(db.webhooks.baseURLConfigured?db.webhooks.baseURL:`http://${req.headers.host}`)}
const root=path.dirname(fileURLToPath(import.meta.url));
const version=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8')).version;
const dataDirectory=process.env.DATA_DIR||path.join(root,'data');
const assetDirectory=path.join(dataDirectory,'files');
const store=createStore(path.join(dataDirectory,'workspace.json'));
const turnstile=createTurnstile(process.env,fetch,store.sql);
const auth=createAuth(store.sql,process.env,store.defaultTenantId);
const mcp=createMCP(store,auth,process.env);
const xero=createXero(store,auth,process.env);
const requestContext=new AsyncLocalStorage();
const activeCompany=()=>requestContext.getStore()?.companyId||store.defaultCompanyId;
const readWorkspace=()=>store.read(activeCompany());
const saveWorkspace=(db,sideEffect)=>store.save(db,sideEffect,activeCompany());
const exchange=createExchange(store.sql);
const customDomains=createCustomDomains(store);
const objects=objectStorage();
async function assetResponse(res,asset,options){if(asset.storage==='tos'){res.writeHead(302,{Location:await objects.presign(asset,options?.inline),'Cache-Control':'no-store','Referrer-Policy':'no-referrer'});return res.end()}return sendAsset(res,asset,assetDirectory,options)}
const tracking=createTracking(store.sql);
if(auth.enabled&&!auth.localAccounts)smtp={enabled:true,send:auth.send};
const rateLimits=new Map();
function rateLimit(req,path){const ip=req.socket.remoteAddress;const key=ip+'|'+(path.startsWith('/api/auth')?'auth':'general');const time=Date.now();let entry=rateLimits.get(key);if(!entry||time-entry.start>60000){entry={start:time,count:0};rateLimits.set(key,entry)}if(++entry.count>(path.startsWith('/api/auth')?30:300))return false;if(rateLimits.size>10000)for(const [k,v] of rateLimits)if(time-v.start>60000)rateLimits.delete(k);return true;}
const json=(res,status,value)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(value))};
async function body(req){const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>8*1024*1024)throw Object.assign(Error('Request too large'),{status:413});chunks.push(chunk)}const value=JSON.parse(Buffer.concat(chunks).toString('utf8')||'{}');if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Use a JSON object');return value}
function authorized(req){if(auth.enabled)return Boolean(auth.session(req));if(!process.env.INTERNAL_PASSWORD)return true;const expected=Buffer.from(`${process.env.INTERNAL_USER||'admin'}:${process.env.INTERNAL_PASSWORD}`);const supplied=Buffer.from((req.headers.authorization||'').replace(/^Basic /,''),'base64');return supplied.length===expected.length&&crypto.timingSafeEqual(supplied,expected)}
function shareResponse(q,db){return {quote:publicQuote(q),contact:db.contacts.find(c=>c.id===q.contactId),settings:publicSettings(db.settings),turnstile:turnstile.publicConfig(),reviews:publicReviews(db),review:q.progress==='Complete'?db.reviews.find(r=>r.quoteId===q.id)||null:null}}
function canRespond(q){return ['Sent','Viewed'].includes(q.status)&&Date.parse(q.expires)>Date.now()}
function commit(db,res,value,status=200,sideEffect){saveWorkspace(db,sideEffect);return json(res,status,value)}
const server=http.createServer((req,res)=>{
 securityHeaders(res);
 try{
 const url=new URL(req.url,'http://localhost');
 const scoped=url.pathname.match(/^\/(\d+)(?:\/|$)/);const tenantCode=scoped?.[1]||String(req.headers['x-dowi-tenant-id']||'');
 if(scoped)url.pathname=url.pathname.replace(/^\/\d+(?=\/|$)/,'')||'/';
 if(scoped&&url.pathname[0]!=='/')url.pathname='/'+url.pathname;
 const parts=url.pathname.split('/').filter(Boolean);let user=auth.enabled?auth.session(req):null;
 if(scoped&&auth.enabled&&!user&&req.method==='GET'&&!url.pathname.startsWith('/api/')){res.writeHead(302,{Location:'/login?tenant='+encodeURIComponent(tenantCode),'Cache-Control':'no-store'});return res.end()}
 const hostname=String(req.headers.host||'').split(':')[0].toLowerCase(),hostDomain=store.domainForHost(hostname);
 const shared=parts[0]==='api'&&parts[1]==='shared',previewRoute=parts[0]==='api'&&parts[1]==='preview',publicQuoteRoute=parts[0]==='q'||shared||previewRoute;
 const token=publicQuoteRoute?((shared||previewRoute)?parts[2]:parts[1]):'';const found=token?store.companyForQuote(token):null;
 const memberships=auth.enabled?(user?memberCompanies(store,user.id):[]):store.allCompanies();let companyId=store.defaultCompanyId;
 if(hostDomain){companyId=hostDomain.company_id;if(publicQuoteRoute&&found&&found.company.id!==companyId)return json(res,404,{error:'Quote not found'});if(!publicQuoteRoute&&!['branding','app.js','quote-filters.js','integrations.js','turnstile.js','style.css','index.html','settings-design.js','settings-design.css','app-design.css','brand','source'].includes(parts[0]||'')&&url.pathname!=='/favicon.ico')return json(res,404,{error:'Not found'})}
 else if(publicQuoteRoute&&found)companyId=found.company.id;
 else{
  const requested=String(req.headers['x-dowi-company-id']||'');
  if(tenantCode){const match=memberships.find(c=>c.tenantCode===tenantCode);if(!match)return json(res,auth.enabled&&!user?401:403,{error:'You do not have access to this company tenant'});if(requested&&requested!==match.id)return json(res,403,{error:'Company and tenant do not match'});companyId=match.id}
  else if(requested){if(!memberships.some(c=>c.id===requested))return json(res,403,{error:'You do not have access to this company tenant'});companyId=requested}
  else companyId=memberships[0]?.id||store.defaultCompanyId;
 }
 if(previewRoute&&found){const q=store.read(found.company.id).quotes.find(q=>q.id===found.quoteId);if(['Draft','Withdrawn'].includes(q.status)&&!(auth.enabled?memberships.some(c=>c.id===found.company.id):authorized(req)))return json(res,auth.enabled&&user?403:401,{error:'Sign in required to preview an unpublished quote'})}
 const tenantId=store.company(companyId).tenantId;
 if(user&&!publicQuoteRoute&&!hostDomain){req.workspaceTenantId=tenantId;user=auth.session(req)}
 requestContext.run({companyId,tenantId,user,hostDomain},()=>processRequest(req,res,url,parts,user).catch(err=>json(res,err.status||400,{error:err.message})));
 }catch(error){json(res,error.status||400,{error:'Invalid request'})}
});

async function processRequest(req,res,url,parts,user){try{
 const shared=parts[0]==='api'&&parts[1]==='shared';
 res.setHeader('Referrer-Policy','no-referrer');res.setHeader('X-Content-Type-Options','nosniff');
 if(url.pathname==='/source'&&req.method==='GET'){res.writeHead(302,{Location:process.env.SOURCE_URL||'https://github.com/dayellahk/dowi-quotes-community','Cache-Control':'no-store'});return res.end()}
 if(url.pathname.startsWith('/api/billing'))return json(res,404,{error:'Billing is not included in the open-source server'});
 if(url.pathname==='/api/edition'&&req.method==='GET'){const owner=auth.requireOwner(req);return json(res,200,editionStatus(store.sql,owner.tenantId))}
 if(url.pathname==='/healthz')return json(res,200,{status:'ok',version,edition:'self-hosted',database:'sqlite'});
 if(webURL&&configuredPortalURL&&new URL(webURL).origin!==new URL(configuredPortalURL).origin&&req.method==='GET'&&url.pathname==='/login'&&req.headers.host===new URL(configuredPortalURL).host&&!url.searchParams.has('returnTo')){res.writeHead(302,{Location:webURL+'/login'+url.search,'Cache-Control':'no-store'});return res.end()}
 if(!rateLimit(req,url.pathname))return json(res,429,{error:'Too many requests. Please try again shortly.'});
 const externalProtocolRoute=url.pathname==='/mcp'||url.pathname.startsWith('/oauth/');
 if(!externalProtocolRoute&&req.headers.origin&&req.headers.origin!==(configuredPortalURL||`http://${req.headers.host}`)&&req.headers.origin!==`https://${req.headers.host}`)return json(res,403,{error:'Cross-origin requests are not allowed'});
 const isWrite=!['GET','HEAD'].includes(req.method);
 if(isWrite&&parts[0]==='api'&&!req.headers['content-type']?.startsWith('application/json'))return json(res,415,{error:'Use application/json'});
 if(isWrite&&auth.enabled&&req.headers.cookie?.includes('dowi_session=')&&!req.headers.authorization&&!req.headers.origin)return json(res,403,{error:'Request origin is required'});
  const input=isWrite&&parts[0]==='api'?await body(req):{};
 if(await auth.route(req,res,url,input))return;
 if(await mcp.route(req,res,url,input,requestContext.getStore()))return;
 if(await xero.route(req,res,url,input,requestContext.getStore()))return;
 if(auth.enabled&&url.pathname==='/'&&!user){res.writeHead(302,{Location:'/login'});return res.end()}
 if(auth.enabled&&parts[0]==='api'&&['settings','webhooks','companies','domain'].includes(parts[1])&&isWrite)auth.requireOwner(req);
 if(url.pathname==='/branding/logo'&&req.method==='GET'){const db=readWorkspace();const logo=db.assets.find(a=>a.id===db.settings.logoId);if(!logo||!logo.type.startsWith('image/')){res.writeHead(404);return res.end('Logo unavailable')}return assetResponse(res,logo,{inline:true})}
 if(parts[0]==='q'&&req.method==='GET'&&url.searchParams.has('preview')&&!['Draft','Withdrawn'].includes(readWorkspace().quotes.find(q=>q.token===parts[1])?.status||'Draft')){const domain=store.getDomain(activeCompany());if(domain?.status==='active'&&req.headers.host!==domain.hostname){res.writeHead(302,{Location:'https://'+domain.hostname+url.pathname+url.search,'Cache-Control':'no-store'});return res.end()}}
 if(parts[0]==='api'){
  const publicPreview=parts[1]==='preview'&&req.method==='GET'&&(parts.length===3||parts.length===4&&parts[3]==='logo');
  if(!shared&&!publicPreview&&parts[1]!=='lead-form'&&!authorized(req)){if(!auth.enabled)res.setHeader('WWW-Authenticate','Basic realm="Dowi Quotes"');return json(res,401,{error:'Sign in required'})}
  if(user?.permissions?.templatesItems===false&&['templates','items'].includes(parts[1]))return json(res,403,{error:'Your role does not include Templates & Items'});
  if(auth.enabled&&['backup','webhooks','domain'].includes(parts[1])&&!(parts[1]==='backup'&&parts[2]==='status'))auth.requireOwner(req);
  if(!['GET','HEAD'].includes(req.method)&&!req.headers['content-type']?.startsWith('application/json'))return json(res,415,{error:'Use application/json'});
  if(req.headers.origin&&req.headers.origin!==`http://${req.headers.host}`&&req.headers.origin!==`https://${req.headers.host}`)return json(res,403,{error:'Cross-origin requests are not allowed'});
  // Verify before reading the workspace: verification awaits a remote service.
  const verificationAction=turnstileAction(req.method,url.pathname);
  if(verificationAction)await turnstile.verify(req,input,verificationAction);
  // Read current data after all asynchronous verification completes.
  const b=input;const db=readWorkspace();
  if(parts[1]==='exchange-rate'&&req.method==='GET')return json(res,200,await exchange.rate(url.searchParams.get('from')||'',url.searchParams.get('to')||''));
  if(parts[1]==='companies'){
   const tenantId=requestContext.getStore().tenantId;
   if(req.method==='GET'&&parts.length===2)return json(res,200,{companies:auth.enabled?memberCompanies(store,user.id):store.allCompanies(),activeCompanyId:activeCompany()});
   if(req.method==='POST'&&parts.length===2){if((auth.enabled?memberCompanies(store,user.id):store.allCompanies()).length>=20)throw Object.assign(Error('An account can have up to 20 company tenants'),{status:409});const settings=settingsFields({...db.settings,...b});settings.logoId='';const company=createIndependentCompany(store,user?.id,settings);return json(res,201,{company})}
   return json(res,405,{error:'Unsupported company action'});
  }
  if(parts[1]==='domain'){
   if(req.method==='GET'&&parts.length===2)return json(res,200,{configured:customDomains.configured,target:process.env.CLOUDFLARE_SAAS_TARGET||'',domain:store.getDomain(activeCompany())});
   if(req.method==='POST'&&parts.length===2)return json(res,200,{configured:customDomains.configured,target:process.env.CLOUDFLARE_SAAS_TARGET||'',domain:await customDomains.add(activeCompany(),b.hostname)});
   if(req.method==='POST'&&parts[2]==='refresh')return json(res,200,{domain:await customDomains.refresh(activeCompany())});
   if(req.method==='DELETE'&&parts.length===2)return json(res,200,await customDomains.remove(activeCompany()));
   return json(res,405,{error:'Unsupported domain action'});
  }
  if(parts[1]==='lead-form'&&parts.length===2){if(req.method==='GET')return json(res,200,{company:db.settings.company,email:db.settings.email,phone:db.settings.phone,logoId:db.settings.logoId||'',turnstile:turnstile.publicConfig()});if(req.method==='POST'){const lead={...leadFields(b),id:id(),status:'New',created:now(),updated:now()};db.leads.unshift(lead);return commit(db,res,{received:true},201)}return json(res,405,{error:'Unsupported enquiry action'})}
  if(parts[1]==='leads'){if(req.method==='GET'&&parts.length===2)return json(res,200,db.leads);const lead=db.leads.find(l=>l.id===parts[2]);if(!lead)return json(res,404,{error:'Lead not found'});if(req.method==='POST'&&parts[3]==='convert'){const quote=convertLead(lead,db);Object.assign(quote,quoteOwner(store.sql,requestContext.getStore().tenantId,user?.id));return commit(db,res,quote)};if(req.method==='POST'&&parts[3]==='status'){if(!['New','Contacted','Archived'].includes(b.status)||lead.status==='Converted')throw Error('Invalid lead status');lead.status=b.status;lead.updated=now();return commit(db,res,lead)}return json(res,405,{error:'Unsupported lead action'})}
  if(parts[1]==='reviews'){if(req.method==='GET'&&parts.length===2)return json(res,200,db.reviews);const review=db.reviews.find(r=>r.id===parts[2]);if(!review)return json(res,404,{error:'Review not found'});if(req.method==='POST'&&parts[3]==='feature'){if(b.featured&&(!review.publishConsent||review.rating<4))throw Error('Only consented 4- or 5-star reviews can be featured');review.featured=b.featured===true;return commit(db,res,review)}return json(res,405,{error:'Unsupported review action'})}
  if(shared){
   const q=db.quotes.find(q=>q.token===parts[2]);if(!q||['Draft','Withdrawn'].includes(q.status))return json(res,404,{error:'Quote not found'});
   if(req.method==='GET'&&parts[3]==='logo'&&parts.length===4){const logo=db.assets.find(a=>a.id===db.settings.logoId);if(!logo||!logo.type.startsWith('image/'))return json(res,404,{error:'Logo unavailable'});return assetResponse(res,logo,{inline:true})}
   if(req.method==='GET'&&parts[3]==='attachments'){const asset=db.assets.find(a=>a.id===parts[4]);if(!asset||!q.attachments.some(a=>a.id===asset.id))return json(res,404,{error:'File not found'});return assetResponse(res,asset,{inline:url.searchParams.get('inline')==='1'})}
   if(req.method==='GET'&&parts.length===3)return json(res,200,{...shareResponse(q,db),viewChallenge:tracking.challenge(q.token)});
   if(req.method==='POST'&&['view','heartbeat'].includes(parts[3])){const result=tracking.record(db,q,{...b,heartbeat:parts[3]==='heartbeat'},auth.enabled?Boolean(user):Boolean(process.env.INTERNAL_PASSWORD&&authorized(req)));saveWorkspace(db,result.apply);return json(res,200,{counted:result.counted,viewChallenge:tracking.challenge(q.token)})}

   if(req.method==='POST'&&['accept','decline'].includes(parts[3])){
    if(!canRespond(q))return json(res,409,{error:'This quote is no longer available for acceptance or decline'});
    const name=text(b.name,'Your full name',{required:true,max:150});const comment=text(b.comment,'Comments',{max:3000});
    if(parts[3]==='accept'){acceptQuote(q,b);activity(q,`Quote accepted by ${name}`);enqueue(db,'quote_accepted',q,{accepted:q.acceptance})}
    else{q.status='Declined';q.declined={name,when:now(),comment};activity(q,`Quote declined by ${name}`);enqueue(db,'quote_declined',q,{declined:q.declined})}
    return commit(db,res,publicQuote(q),200);
   }
   if(req.method==='POST'&&parts[3]==='reviews'){if(q.status!=='Accepted'||q.progress!=='Complete')return json(res,409,{error:'Feedback is available after the project is completed'});if(db.reviews.some(r=>r.quoteId===q.id))return json(res,409,{error:'Feedback has already been submitted for this project'});const contact=db.contacts.find(c=>c.id===q.contactId);const review={...reviewFields(b),id:id(),quoteId:q.id,company:contact?.company||'',created:now(),featured:false};db.reviews.unshift(review);activity(q,'Customer submitted project feedback');return commit(db,res,{received:true},201)}
   if(req.method==='POST'&&parts[3]==='messages'){const message={id:id(),text:text(b.text,'Question',{required:true,max:3000}),author:text(b.name,'Your name',{required:true,max:150}),date:now(),staff:false};q.messages.push(message);activity(q,'Customer asked a question');enqueue(db,'customer_question',q,{question:message});return commit(db,res,publicQuote(q))}
   return json(res,405,{error:'Unsupported customer action'});
  }
  if(parts[1]==='preview'&&req.method==='GET'&&parts[3]==='logo'&&parts.length===4){const quote=db.quotes.find(q=>q.token===parts[2]),logo=db.assets.find(a=>a.id===db.settings.logoId);if(!quote||!logo||!logo.type.startsWith('image/'))return json(res,404,{error:'Logo unavailable'});return assetResponse(res,logo,{inline:true})}
  if(parts[1]==='preview'&&req.method==='GET'&&parts.length===3){const quote=db.quotes.find(q=>q.token===parts[2]);if(!quote)return json(res,404,{error:'Quote not found'});return json(res,200,shareResponse(quote,db))}
  if(parts[1]==='assets'){if(req.method==='POST'&&parts.length===2){const asset=saveAsset(b,assetDirectory);try{await objects.uploadAsset(asset,assetDirectory)}catch{fs.rmSync(path.join(assetDirectory,asset.id),{force:true});throw Error('Attachment storage is temporarily unavailable')}const fresh=readWorkspace();fresh.assets.unshift(asset);return commit(fresh,res,assetMetadata(asset),201)}if(req.method==='GET'&&parts.length===3){const asset=db.assets.find(a=>a.id===parts[2]);if(!asset)return json(res,404,{error:'File not found'});return assetResponse(res,asset,{inline:url.searchParams.get('inline')==='1'})}return json(res,405,{error:'Unsupported file action'})}
  if(parts[1]==='backup'&&parts[2]==='status'&&req.method==='GET'){let status={status:objects.enabled?'Pending first backup':'TOS not configured'};try{status=JSON.parse(fs.readFileSync(path.join(dataDirectory,'backup-status.json'),'utf8'))}catch{}return json(res,200,status)}
  if(parts[1]==='backup'&&parts.length===2&&req.method==='GET'){
   for(const asset of db.assets)await objects.ensureLocal(asset,assetDirectory);
   const snapshot=createBackup(db,assetDirectory);
   res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Disposition':`attachment; filename="Dowi-Quotes-Backup-${new Date().toISOString().replace(/[:.]/g,'-')}.json"`});return res.end(snapshot);
  }
  if(parts[1]==='workspace'&&req.method==='GET')return json(res,200,{...db,items:user?.permissions?.templatesItems===false?[]:db.items,templates:user?.permissions?.templatesItems===false?[]:db.templates,mailEnabled:auth.enabled&&!auth.localAccounts?auth.boxes(user).some(x=>x.status==='Connected'):smtp.enabled,cloudAuth:auth.enabled,currentUser:user,teamMembers:tenantTeam(store.sql,requestContext.getStore().tenantId),mailboxes:auth.boxes(user),quotes:db.quotes.map(q=>({...q,live:tracking.live(q.id)})),mailDeliveries:db.mailDeliveries.map(({text,...d})=>d),mcpURL:(configuredPortalURL||`http://${req.headers.host}`)+'/mcp',publicPortalURL:portalURL(db,req),companies:auth.enabled?memberCompanies(store,user.id):store.allCompanies(),tenantId:store.company(activeCompany()).tenantCode,activeCompanyId:activeCompany(),customDomain:store.getDomain(activeCompany()),customDomainConfigured:customDomains.configured,customDomainTarget:process.env.CLOUDFLARE_SAAS_TARGET||'',webhooks:{...db.webhooks,secret:undefined},deliveries:undefined});
  if(parts[1]==='settings'&&req.method==='PUT'){const settings=settingsFields({...db.settings,...b});if(settings.logoId&&!db.assets.some(a=>a.id===settings.logoId&&a.type.startsWith('image/')))throw Error('Choose an uploaded image as the company logo');db.settings=settings;return commit(db,res,db.settings)}
  if(parts[1]==='webhooks'){
   if(req.method==='GET')return json(res,200,{config:{...db.webhooks,secret:undefined,hasSecret:Boolean(db.webhooks.secret)},events,deliveries:db.deliveries});
   if(req.method==='PUT'){db.webhooks=webhookConfig(b,db.webhooks);return commit(db,res,{...db.webhooks,secret:undefined})}
   if(req.method==='POST'&&parts[2]==='test'){if(!events.includes(b.event))throw Error('Select a valid event');const q=db.quotes.find(q=>q.status!=='Draft')||db.quotes[0];if(!q)throw Error('Create a quote before testing');const d=enqueue(db,b.event,q,{test:true},true);if(!d)throw Error('Set a webhook URL first');return commit(db,res,d,202)}
   if(req.method==='POST'&&parts[2]==='replay'){const old=db.deliveries.find(d=>d.id===b.id);if(!old)throw Error('Delivery not found');if(!db.webhooks.url)throw Error('Set a webhook URL first');db.webhooks.paused=false;const d={...old,id:id(),url:db.webhooks.url,created:now(),status:'Pending',attempts:0,nextAttempt:now(),responseCode:null,error:'',replayOf:old.id};db.deliveries.unshift(d);return commit(db,res,d,202)}
   return json(res,405,{error:'Unsupported webhook action'});
  }
  const collection=parts[1];if(!['quotes','contacts','items','templates'].includes(collection))return json(res,404,{error:'Not found'});
  const fields=()=>collection==='contacts'?contactFields(b):collection==='items'?{name:text(b.name,'Item name',{required:true,max:200}),description:text(b.description,'Description'),price:number(b.price,'Price'),cost:number(b.cost??0,'Cost')}:collection==='templates'?{name:text(b.name,'Template name',{required:true,max:200}),description:text(b.description,'Description'),items:Array.isArray(b.items)&&b.items.length?normalizeChoices(uniqueItems(b.items.map(lineItem))):(()=>{throw Error('Template requires at least one item')})()}:quoteFields(b,db);
  if(req.method==='POST'&&!parts[2]){const record={...fields(),id:id()};if(collection==='quotes')Object.assign(record,{...quoteOwner(store.sql,requestContext.getStore().tenantId,Object.hasOwn(b,'assigneeId')?b.assigneeId:user?.id),number:Math.max(1000,...db.quotes.map(q=>q.number))+1,status:'Draft',created:now(),updated:now(),token:crypto.randomBytes(24).toString('hex'),activity:[{text:'Quote created',date:now()}],messages:[],privateNotes:[],views:0,followups:[],progress:'Active',archived:false});db[collection].unshift(record);return commit(db,res,record,201)}
  const record=db[collection].find(r=>r.id===parts[2]);if(!record)return json(res,404,{error:'Not found'});
  if(req.method==='GET')return json(res,200,record);
  if(req.method==='DELETE'){if(collection==='contacts'&&db.quotes.some(q=>q.contactId===record.id))return json(res,409,{error:'This customer has quotes and cannot be deleted'});if(collection==='quotes'&&record.status!=='Draft')return json(res,409,{error:'Only draft quotes can be deleted'});db[collection]=db[collection].filter(r=>r.id!==record.id);return commit(db,res,{ok:true})}
  if(req.method==='PUT'){if(collection==='quotes'&&record.status!=='Draft')return json(res,409,{error:'Take the quote offline before editing; accepted quotes cannot be edited'});const values=fields();if(collection==='quotes'&&Object.hasOwn(b,'assigneeId')&&b.assigneeId!==record.assigneeId)Object.assign(values,quoteOwner(store.sql,requestContext.getStore().tenantId,b.assigneeId));Object.assign(record,values);if(collection==='quotes')activity(record,'Quote updated');return commit(db,res,record)}
  if(collection==='quotes'&&req.method==='POST'){
   if(parts[3]==='accept-on-behalf'){if(!canRespond(record))return json(res,409,{error:'Only current open quotes can be accepted'});if(b.authorized!==true)throw Error('Confirm you have the customer’s authorization');const evidence=text(b.evidence,'Authorization record',{required:true,max:3000});acceptQuote(record,b);record.acceptance.recordedByTeam=true;activity(record,`Acceptance recorded by ${process.env.INTERNAL_USER||'admin'} on behalf of ${record.acceptedBy}. Authorization: ${evidence}`);enqueue(db,'quote_accepted',record,{accepted:record.acceptance});return commit(db,res,record,200)}
   if(parts[3]==='assign'){const owner=quoteOwner(store.sql,requestContext.getStore().tenantId,b.assigneeId);Object.assign(record,owner);activity(record,'Responsible colleague updated');return commit(db,res,record)}
   if(parts[3]==='send-email'){let sending=smtp;if(auth.enabled&&!auth.localAccounts){const boxes=auth.boxes(user);const box=b.provider?boxes.find(x=>x.provider===b.provider&&x.status==='Connected'):boxes.find(x=>x.status==='Connected');if(!box)throw Error('Connect your Microsoft or Google mailbox first');sending={...smtp,memberId:user.id,provider:box.provider}}queueQuoteEmail(db,record,portalURL(db,req),sending,b.requestId);if(record.status==='Draft'){const firstSend=!record.firstSent;record.status='Sent';record.firstSent??=now();activity(record,'Quote published for email delivery');if(firstSend)enqueue(db,'quote_sent',record)}return commit(db,res,record,202)}
   if(parts[3]==='status'){const desired=b.status;const allowed={Draft:['Sent'],Sent:['Declined','Withdrawn','Draft'],Viewed:['Declined','Withdrawn','Draft'],Declined:['Draft'],Withdrawn:['Draft'],Accepted:[]};if(!allowed[record.status]?.includes(desired))return json(res,409,{error:'Invalid status transition'});record.status=desired;if(desired==='Sent'){const firstSend=!record.firstSent;record.firstSent??=now();activity(record,'Quote published — customer link available');if(firstSend)enqueue(db,'quote_sent',record)}else{activity(record,desired==='Draft'?'Quote taken offline for editing':`Quote ${desired.toLowerCase()}`);if(desired==='Declined')enqueue(db,'quote_declined',record)}return commit(db,res,record)}
   if(parts[3]==='complete'){if(record.status!=='Accepted')return json(res,409,{error:'Only accepted quotes can be completed'});if(record.progress==='Complete')return json(res,409,{error:'Quote already completed'});record.progress='Complete';record.archived=true;activity(record,'Quote completed and archived');enqueue(db,'quote_completed',record);return commit(db,res,record)}
   if(parts[3]==='notes'){record.privateNotes.unshift({id:id(),text:text(b.text,'Private note',{required:true,max:3000}),date:now(),author:db.settings.company});activity(record,'Private note added');return commit(db,res,record)}
   if(parts[3]==='messages'){record.messages.push({id:id(),text:text(b.text,'Reply',{required:true,max:3000}),date:now(),author:db.settings.company,staff:true});activity(record,'Team replied to the customer');return commit(db,res,record)}
   if(parts[3]==='followups'){if(!['Sent','Viewed'].includes(record.status))return json(res,409,{error:'Follow-ups are for open quotes'});const due=text(b.due,'Follow-up date',{required:true});if(Number.isNaN(Date.parse(due)))throw Error('Enter a valid date');record.followups.unshift({id:id(),due:new Date(due).toISOString(),text:text(b.text,'Follow-up note',{max:3000}),done:false});activity(record,'Follow-up scheduled');return commit(db,res,record)}
   if(parts[3]==='followup-done'){const f=record.followups.find(f=>f.id===b.id);if(!f)throw Error('Follow-up not found');f.done=true;activity(record,'Follow-up completed');return commit(db,res,record)}
   if(parts[3]==='duplicate'){const q={...structuredClone(record),id:id(),number:Math.max(1000,...db.quotes.map(q=>q.number))+1,title:record.title+' (copy)',status:'Draft',created:now(),updated:now(),token:crypto.randomBytes(24).toString('hex'),messages:[],privateNotes:[],activity:[{text:'Quote copied',date:now()}],views:0,followups:[],progress:'Active',archived:false};for(const k of ['firstSent','acceptedBy','acceptedAt','acceptance','declined','lastViewed','lastViewEvent'])delete q[k];db.quotes.unshift(q);return commit(db,res,q,201)}
  }
  return json(res,405,{error:'Unsupported action'});
 }
 const name=['/login','/account'].includes(url.pathname)?'account.html':['/','/dashboard','/quotes','/contacts','/templates','/items','/settings','/leads','/reviews','/lead'].includes(url.pathname)||url.pathname.startsWith('/q/')?'index.html':url.pathname.replace(/^\//,'');const full=path.resolve(root,'public',name);if(!full.startsWith(path.join(root,'public')+path.sep)||!fs.existsSync(full)||!fs.statSync(full).isFile()){res.writeHead(404);return res.end('Not found')}
 res.writeHead(200,{'Content-Type':({'.html':'text/html','.css':'text/css','.js':'text/javascript','.svg':'image/svg+xml'})[path.extname(full)]||'application/octet-stream','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'});fs.createReadStream(full).pipe(res);
 }catch(err){json(res,err.status||400,{error:err.message})}}
const stopWorker=startWebhookWorker(store);
const stopMail=startMailWorker(store,smtp);
// Xero requests run only when a company owner submits them.
server.listen(Number(process.env.PORT)||3000,process.env.HOST||'127.0.0.1',()=>console.log(`Dowi Quotes: http://${process.env.HOST||'127.0.0.1'}:${process.env.PORT||3000}`));
process.on('SIGTERM',()=>{stopWorker();stopMail();server.close(()=>{store.close();process.exit()})});
