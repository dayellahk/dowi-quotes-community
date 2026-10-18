import {quoteOwner} from './quote-owners.mjs';
import crypto from 'node:crypto';
import {roleClaims} from './roles.mjs';
import {memberCompanies} from './tenancy.mjs';
import {activity,id,now,quoteFields,publicQuote,totals,text} from './domain.mjs';
import {hash} from './auth.mjs';

const scopes=['quotes:read','quotes:write','quotes:create'];
const random=()=>crypto.randomBytes(32).toString('base64url');
const encode=value=>Buffer.from(JSON.stringify(value)).toString('base64url');
const html=(res,status,body)=>{res.writeHead(status,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'});res.end(body)};
const json=(res,status,body,headers={})=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...headers});res.end(JSON.stringify(body))};
const safe=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
async function readBody(req,max=1_000_000){let raw='';for await(const part of req){raw+=part;if(Buffer.byteLength(raw)>max)throw Object.assign(Error('Request too large'),{status:413})}return raw}
const sendError=(res,error)=>json(res,error.status||400,{error:error.message||'Request failed'});

export function createMCP(store,auth,env=process.env){
 const issuer=new URL(env.PUBLIC_URL||'http://127.0.0.1:3000').origin;
 const resource=issuer+'/mcp';
 store.sql.exec(`CREATE TABLE IF NOT EXISTS mcp_oauth_flows(id_hash TEXT PRIMARY KEY,payload TEXT NOT NULL,expires INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS mcp_oauth_codes(code_hash TEXT PRIMARY KEY,member_id TEXT NOT NULL,tenant_id TEXT NOT NULL,client_id TEXT NOT NULL,redirect_uri TEXT NOT NULL,challenge TEXT NOT NULL,scope TEXT NOT NULL,resource TEXT NOT NULL,expires INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS mcp_access_tokens(token_hash TEXT PRIMARY KEY,member_id TEXT NOT NULL,tenant_id TEXT NOT NULL,scope TEXT NOT NULL,resource TEXT NOT NULL,expires INTEGER NOT NULL,created TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS mcp_edit_proposals(id TEXT PRIMARY KEY,tenant_id TEXT NOT NULL,company_id TEXT NOT NULL,member_id TEXT NOT NULL,quote_id TEXT NOT NULL,payload TEXT NOT NULL,created TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'Pending',reviewed TEXT,quote_updated TEXT);
 CREATE INDEX IF NOT EXISTS mcp_edit_company_status ON mcp_edit_proposals(company_id,status,created);`);
 store.sql.exec(`CREATE TABLE IF NOT EXISTS mcp_named_tokens(id TEXT PRIMARY KEY,token_hash TEXT UNIQUE NOT NULL,member_id TEXT NOT NULL,tenant_id TEXT NOT NULL,name TEXT NOT NULL,created TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS mcp_draft_requests(member_id TEXT NOT NULL,company_id TEXT NOT NULL,request_id TEXT NOT NULL,quote_id TEXT NOT NULL,PRIMARY KEY(member_id,company_id,request_id));`);
 if(!store.sql.prepare('PRAGMA table_info(mcp_edit_proposals)').all().some(column=>column.name==='quote_updated'))store.sql.exec('ALTER TABLE mcp_edit_proposals ADD COLUMN quote_updated TEXT');
 const redirectAllowed=value=>value==='https://chatgpt.com/connector_platform_oauth_redirect'||/^https:\/\/chatgpt\.com\/connector\/oauth\/[A-Za-z0-9_-]{1,100}$/.test(value);
 const clientAllowed=value=>value==='https://chatgpt.com/oauth/client.json'||/^https:\/\/chatgpt\.com\/oauth\/[A-Za-z0-9_-]{1,100}\/client\.json$/.test(value);
 function issuerRedirect(uri,values){const target=new URL(uri);for(const [key,value] of Object.entries(values))target.searchParams.set(key,value);return target.href}
 function challenge(req){const url=new URL(req.url,issuer),nonce=random();store.sql.prepare('INSERT INTO mcp_oauth_flows VALUES(?,?,?)').run(hash(nonce),encode({returnTo:`/oauth/authorize?flow=${nonce}`}),Date.now()+600000);return issuer+'/login?returnTo='+encodeURIComponent(`/oauth/authorize?flow=${nonce}`)}
 function authFailure(res,scope='quotes:read'){res.setHeader('WWW-Authenticate',`Bearer resource_metadata="${issuer}/.well-known/oauth-protected-resource", scope="${scope}"`);return json(res,401,{error:'Authorization required'})}
 function access(req){const token=req.headers.authorization?.startsWith('Bearer ')?req.headers.authorization.slice(7):'';if(!token)return null;const row=store.sql.prepare('SELECT t.member_id AS memberId,t.tenant_id AS tenantId,t.scope,t.resource,t.expires,m.email,m.role FROM mcp_access_tokens t JOIN members m ON m.id=t.member_id WHERE t.token_hash=? AND t.expires>? AND m.active=1').get(hash(token),Date.now());if(!row||row.resource!==resource||!store.sql.prepare('SELECT 1 FROM tenant_memberships WHERE member_id=? AND tenant_id=? AND active=1').get(row.memberId,row.tenantId))return null;return {...row,scopes:new Set(row.scope.split(/\s+/))}}
 function contextForMember(memberId,tenantId){if(!store.sql.prepare('SELECT 1 FROM tenant_memberships tm JOIN members m ON m.id=tm.member_id WHERE tm.member_id=? AND tm.tenant_id=? AND tm.active=1 AND m.active=1').get(memberId,tenantId))throw Object.assign(Error('Workspace membership is no longer active'),{status:403});return {companies:store.companies(tenantId)}}
 function listQuoteRecords(db,limit,status){return db.quotes.filter(q=>!status||q.status===status).slice(0,limit).map(q=>({id:q.id,number:q.number,title:q.title,status:q.status,customer:db.contacts.find(c=>c.id===q.contactId)?.name||'',currency:q.currency||db.settings.currency,total:totals(q).total,expires:q.expires,updated:q.updated}))}
 const toolSpecs=[
  {name:'list_contacts',title:'List quotation customers',description:'Find existing customers in the connected company before preparing a draft.',inputSchema:{type:'object',properties:{company_id:{type:'string'},search:{type:'string'},limit:{type:'integer',minimum:1,maximum:100}},additionalProperties:false},securitySchemes:[{type:'oauth2',scopes:['quotes:read']}],annotations:{readOnlyHint:true,destructiveHint:false,openWorldHint:false}},
  {name:'list_items',title:'List reusable quotation items',description:'Read the connected company item library and quote currency defaults.',inputSchema:{type:'object',properties:{company_id:{type:'string'}},additionalProperties:false},securitySchemes:[{type:'oauth2',scopes:['quotes:read']}],annotations:{readOnlyHint:true,destructiveHint:false,openWorldHint:false}},
  {name:'create_draft_quote',title:'Create a draft quotation',description:'Prepare a new unsent draft for an existing customer. Reuse request_id when retrying the same request. Does not publish, accept, send email, or create an invoice. Prices are in quote currency; internal costs are in company currency.',inputSchema:{type:'object',properties:{company_id:{type:'string'},request_id:{type:'string',maxLength:100},title:{type:'string'},contactId:{type:'string'},currency:{type:'string'},exchangeRate:{type:'number'},expires:{type:'string'},tax:{type:'number'},notes:{type:'string'},terms:{type:'string'},items:{type:'array',items:{type:'object',properties:{name:{type:'string'},description:{type:'string'},qty:{type:'number'},price:{type:'number'},cost:{type:'number'},discountType:{type:'string',enum:['none','percent','amount']},discountValue:{type:'number'}},required:['name','qty','price'],additionalProperties:false}}},required:['request_id','title','contactId','items'],additionalProperties:false},securitySchemes:[{type:'oauth2',scopes:['quotes:create']}],annotations:{readOnlyHint:false,destructiveHint:false,openWorldHint:false}},
  {name:'get_profile',title:'Get connected Dowi Quotes profile',description:'Return the authenticated workspace identity.',inputSchema:{type:'object',properties:{},additionalProperties:false},securitySchemes:[{type:'oauth2',scopes:['quotes:read']}],annotations:{readOnlyHint:true,destructiveHint:false,openWorldHint:false},_meta:{'openai/profile':true}},
  {name:'list_companies',title:'List company workspaces',description:'List companies in the authenticated tenant.',inputSchema:{type:'object',properties:{},additionalProperties:false},securitySchemes:[{type:'oauth2',scopes:['quotes:read']}],annotations:{readOnlyHint:true,destructiveHint:false,openWorldHint:false}},
  {name:'list_quotes',title:'List quotations',description:'List quotations for one company. Use company_id from list_companies.',inputSchema:{type:'object',properties:{company_id:{type:'string'},status:{type:'string',enum:['Draft','Sent','Viewed','Accepted','Declined','Withdrawn']},limit:{type:'integer',minimum:1,maximum:100}},additionalProperties:false},securitySchemes:[{type:'oauth2',scopes:['quotes:read']}],annotations:{readOnlyHint:true,destructiveHint:false,openWorldHint:false}},
  {name:'get_quote',title:'Get quotation details',description:'Read a quotation and its item pricing from a company in the authenticated tenant.',inputSchema:{type:'object',properties:{company_id:{type:'string'},quote_id:{type:'string'}},required:['quote_id'],additionalProperties:false},securitySchemes:[{type:'oauth2',scopes:['quotes:read']}],annotations:{readOnlyHint:true,destructiveHint:false,openWorldHint:false}},
  {name:'propose_quote_edit',title:'Propose quotation edits',description:'Prepare proposed changes to a draft quotation for review. This only creates a pending proposal; it does not change the quote. A company member must approve the proposal in the web workspace before changes are saved.',inputSchema:{type:'object',properties:{company_id:{type:'string'},quote_id:{type:'string'},changes:{type:'object',properties:{title:{type:'string'},notes:{type:'string'},terms:{type:'string'},expires:{type:'string'},tax:{type:'number'},currency:{type:'string'},exchangeRate:{type:'number'},exchangeRateDate:{type:'string'},exchangeRateSource:{type:'string'},items:{type:'array',items:{type:'object'}}},additionalProperties:false}},required:['quote_id','changes'],additionalProperties:false},securitySchemes:[{type:'oauth2',scopes:['quotes:write']}],annotations:{readOnlyHint:false,destructiveHint:false,openWorldHint:false}}
 ];
 async function toolCall(name,args,identity){
  if(name==='get_profile')return {id:identity.memberId,display_name:identity.email,email:identity.email,tenant_id:identity.tenantId};
  const membership=contextForMember(identity.memberId,identity.tenantId),companyId=args.company_id||membership.companies[0]?.id;
  if(!companyId||!membership.companies.some(c=>c.id===companyId))throw Object.assign(Error('Company is outside your tenant'),{status:403});
  const db=store.read(companyId);
  if(name==='list_contacts'){const search=String(args.search||'').toLowerCase();return {company_id:companyId,contacts:db.contacts.filter(c=>!search||[c.name,c.company,c.email].some(v=>String(v||'').toLowerCase().includes(search))).slice(0,Math.min(100,Math.max(1,Number(args.limit)||50)))};}
  if(name==='list_items'&&roleClaims(store.sql,identity.memberId,identity.tenantId,store.sql.prepare('SELECT role FROM tenant_memberships WHERE member_id=? AND tenant_id=?').get(identity.memberId,identity.tenantId)?.role).permissions.templatesItems===false)throw Object.assign(Error('Your role does not include Templates & Items'),{status:403});
  if(name==='list_items')return {company_id:companyId,company_currency:db.settings.currency,default_tax:db.settings.tax,default_terms:db.settings.terms,items:db.items.slice(0,200)};
  if(name==='create_draft_quote'){
   const requestId=text(args.request_id,'Request ID',{required:true,max:100});
   const previous=store.sql.prepare('SELECT quote_id FROM mcp_draft_requests WHERE member_id=? AND company_id=? AND request_id=?').get(identity.memberId,companyId,requestId);
   if(previous){const quote=db.quotes.find(q=>q.id===previous.quote_id);return {company_id:companyId,quote_id:previous.quote_id,status:quote?.status||'Deleted',reused:true};}
   const currency=args.currency||db.settings.currency;
   if(currency!==db.settings.currency&&!(Number(args.exchangeRate)>0))throw Error('Provide the exchange rate: one quote currency unit in company currency');
   const fields={...quoteOwner(store.sql,identity.tenantId,identity.memberId),...quoteFields({...args,currency,exchangeRate:currency===db.settings.currency?1:args.exchangeRate,exchangeRateSource:currency===db.settings.currency?'same currency':'MCP user supplied',tax:args.tax??db.settings.tax,terms:args.terms??db.settings.terms,expires:args.expires||new Date(Date.now()+30*86400000).toISOString(),attachments:[]},db)};
   const quote={...fields,id:id(),number:Math.max(1000,...db.quotes.map(q=>q.number))+1,status:'Draft',created:now(),updated:now(),token:random(),activity:[{text:'Draft prepared through MCP',date:now()}],messages:[],privateNotes:[],views:0,followups:[],progress:'Active',archived:false};
   db.quotes.unshift(quote);store.save(db,()=>store.sql.prepare('INSERT INTO mcp_draft_requests VALUES(?,?,?,?)').run(identity.memberId,companyId,requestId,quote.id),companyId);
   return {company_id:companyId,quote_id:quote.id,number:quote.number,status:'Draft',title:quote.title,currency:quote.currency,totals:totals(quote),sent:false};
  }
  if(name==='list_companies')return {companies:membership.companies};
  if(name==='list_quotes')return {company_id:companyId,quotes:listQuoteRecords(db,Math.min(100,Math.max(1,Number(args.limit)||50)),args.status)};
  if(name==='get_quote'){
   const quote=db.quotes.find(q=>q.id===args.quote_id);if(!quote)throw Object.assign(Error('Quote not found'),{status:404});
   return {company_id:companyId,quote:{...publicQuote(quote),items:quote.items,customer:db.contacts.find(c=>c.id===quote.contactId)||null,exchangeRate:quote.exchangeRate||1,exchangeRateDate:quote.exchangeRateDate||null,company_currency:db.settings.currency,totals:totals(quote)}};
  }
  if(name==='propose_quote_edit'){
   const quote=db.quotes.find(q=>q.id===args.quote_id);if(!quote)throw Object.assign(Error('Quote not found'),{status:404});if(quote.status!=='Draft')throw Object.assign(Error('Only draft quotations can be edited by AI proposals. Take the quotation offline first.'),{status:409});
   const input={...quote,...args.changes,contactId:quote.contactId,attachments:quote.attachments||[],items:args.changes.items??quote.items};
   const changes=quoteFields(input,db);const proposalId=crypto.randomUUID();
   store.sql.prepare('INSERT INTO mcp_edit_proposals(id,tenant_id,company_id,member_id,quote_id,payload,created,status,quote_updated) VALUES(?,?,?,?,?,?,?,\'Pending\',?)').run(proposalId,identity.tenantId,companyId,identity.memberId,quote.id,JSON.stringify(changes),now(),quote.updated||'');
   return {proposal_id:proposalId,status:'Pending approval',quote_id:quote.id,quote_title:quote.title,proposed:{title:changes.title,currency:changes.currency,tax:changes.tax,expires:changes.expires,items:changes.items,totals:totals({...quote,...changes})},approval_required:true,approval_location:'Open Dowi Quotes → Settings → AI edit proposals and approve this proposal.'};
  }
  throw Object.assign(Error('Unknown tool'),{status:404});
 }
 async function handleMCP(req,res){
  if(req.method==='OPTIONS'){res.writeHead(204,{'Access-Control-Allow-Origin':'https://chatgpt.com','Access-Control-Allow-Methods':'POST, OPTIONS','Access-Control-Allow-Headers':'authorization, content-type, mcp-session-id','Access-Control-Max-Age':'86400'});return res.end()}
  if(req.method!=='POST')return json(res,405,{error:'Use POST for MCP messages'});
  const identity=access(req);if(!identity)return authFailure(res);
  const raw=await readBody(req);let message;try{message=JSON.parse(raw)}catch{return json(res,400,{error:'Invalid JSON'})}
  res.setHeader('Access-Control-Allow-Origin','https://chatgpt.com');res.setHeader('Vary','Origin');
  if(message.method==='notifications/initialized')return json(res,202,{});
  if(message.method==='initialize')return json(res,200,{jsonrpc:'2.0',id:message.id,result:{protocolVersion:message.params?.protocolVersion||'2025-03-26',capabilities:{tools:{listChanged:false}},serverInfo:{name:'dowi-quotes',version:'1.4.0'},instructions:'Read company data and prepare new unsent quotation drafts within the authenticated tenant. Use existing contacts and a unique request_id. Edits to existing quotes remain proposals until a member approves them. Never claim a draft was emailed or accepted.'}});
  if(message.method==='ping')return json(res,200,{jsonrpc:'2.0',id:message.id,result:{}});
  if(message.method==='tools/list')return json(res,200,{jsonrpc:'2.0',id:message.id,result:{tools:toolSpecs}});
  if(message.method==='tools/call'){
   const spec=toolSpecs.find(tool=>tool.name===message.params?.name);if(!spec)return json(res,200,{jsonrpc:'2.0',id:message.id,result:{content:[{type:'text',text:'Unknown tool'}],isError:true}});
   const requiredScope=spec.securitySchemes[0].scopes[0];if(!identity.scopes.has(requiredScope))return json(res,200,{jsonrpc:'2.0',id:message.id,result:{content:[{type:'text',text:'Permission is required. Reconnect and grant '+requiredScope+'.'}],isError:true,_meta:{'mcp/www_authenticate':`Bearer resource_metadata="${issuer}/.well-known/oauth-protected-resource", scope="${requiredScope}"`}}});
   try{const value=await toolCall(spec.name,message.params?.arguments||{},identity);return json(res,200,{jsonrpc:'2.0',id:message.id,result:{content:[{type:'text',text:JSON.stringify(value)}],structuredContent:value}})}catch(error){return json(res,200,{jsonrpc:'2.0',id:message.id,result:{content:[{type:'text',text:error.message||'Tool failed'}],isError:true}})}
  }
  return json(res,200,{jsonrpc:'2.0',id:message.id,error:{code:-32601,message:'Method not found'}});
 }
 async function oauthRoute(req,res,url){
  const p=url.pathname;
  if(p==='/.well-known/oauth-protected-resource'&&req.method==='GET')return json(res,200,{resource,authorization_servers:[issuer],scopes_supported:scopes});
  if(p==='/.well-known/oauth-authorization-server'&&req.method==='GET')return json(res,200,{issuer,authorization_endpoint:issuer+'/oauth/authorize',token_endpoint:issuer+'/oauth/token',authorization_response_iss_parameter_supported:true,client_id_metadata_document_supported:true,token_endpoint_auth_methods_supported:['none'],code_challenge_methods_supported:['S256'],scopes_supported:scopes});
  if(p==='/oauth/authorize'&&req.method==='GET'){
   let pending=url.searchParams.get('flow');let flow;
   if(pending){const row=store.sql.prepare('SELECT payload FROM mcp_oauth_flows WHERE id_hash=? AND expires>?').get(hash(pending),Date.now());if(!row)throw Object.assign(Error('Authorization request expired. Try connecting again.'),{status:400});flow=JSON.parse(Buffer.from(row.payload,'base64url').toString())}
   else{
    const clientId=url.searchParams.get('client_id')||'',redirectURI=url.searchParams.get('redirect_uri')||'',challengeValue=url.searchParams.get('code_challenge')||'',requestedResource=url.searchParams.get('resource')||'',method=url.searchParams.get('code_challenge_method')||'',scope=(url.searchParams.get('scope')||'quotes:read').split(/\s+/).filter(Boolean);
    if(!clientAllowed(clientId)||!redirectAllowed(redirectURI)||url.searchParams.get('response_type')!=='code'||method!=='S256'||!/^[A-Za-z0-9_-]{43}$/.test(challengeValue)||requestedResource!==resource||scope.some(s=>!scopes.includes(s))||!scope.includes('quotes:read'))throw Object.assign(Error('Invalid OAuth authorization request'),{status:400});
    const flowId=random();flow={clientId,redirectURI,challenge:challengeValue,resource,scope:scope.join(' '),state:url.searchParams.get('state')||'',nonce:url.searchParams.get('nonce')||''};store.sql.prepare('INSERT INTO mcp_oauth_flows VALUES(?,?,?)').run(hash(flowId),encode(flow),Date.now()+600000);
    if(!auth.session(req)){res.writeHead(302,{Location:issuer+'/login?returnTo='+encodeURIComponent(`/oauth/authorize?flow=${flowId}`),'Cache-Control':'no-store','Referrer-Policy':'no-referrer'});return res.end()}
    pending=flowId;
   }
   const user=auth.session(req);if(!user){res.writeHead(302,{Location:issuer+'/login?returnTo='+encodeURIComponent(`/oauth/authorize?flow=${pending}`),'Cache-Control':'no-store','Referrer-Policy':'no-referrer'});return res.end()}
   const csrf=random();store.sql.prepare('UPDATE mcp_oauth_flows SET payload=? WHERE id_hash=?').run(encode({...flow,memberId:user.id,tenantId:user.tenantId,csrf}),hash(pending));
   return html(res,200,`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Connect Dowi Quotes</title><main style="font:16px system-ui;max-width:520px;margin:12vh auto;padding:30px;border:1px solid #ddd;border-radius:16px"><h1>Connect Dowi Quotes to ChatGPT?</h1><p>Allow ChatGPT to read quotations in your tenant and draft suggested edits. AI edits stay pending until a company member approves them in Dowi Quotes.</p><p>Requested access: <strong>${flow.scope.split(' ').map(s=>safe(s==='quotes:read'?'Read company quotations and contacts':s==='quotes:create'?'Create unsent quotation drafts':'Propose quotation edits')).join(', ')}</strong></p><p>Signed in as ${safe(user.email)}</p><form method="post" action="/oauth/consent"><input type="hidden" name="flow" value="${safe(pending)}"><input type="hidden" name="csrf" value="${safe(csrf)}"><label>Company tenant<select name="tenant_id">${memberCompanies(store,user.id).map(c=>`<option value="${safe(c.tenantId)}">${safe(c.name)} · ${safe(c.tenantCode)}</option>`).join('')}</select></label><button name="decision" value="allow" style="padding:12px 18px">Allow</button> <button name="decision" value="deny" style="padding:12px 18px">Cancel</button></form></main>`);
  }
  if(p==='/oauth/consent'&&req.method==='POST'){
   const form=new URLSearchParams(await readBody(req)),flowId=form.get('flow')||'',row=store.sql.prepare('SELECT payload FROM mcp_oauth_flows WHERE id_hash=? AND expires>?').get(hash(flowId),Date.now()),flow=row?JSON.parse(Buffer.from(row.payload,'base64url').toString()):null,user=auth.session(req);
   if(!flow||!user||flow.memberId!==user.id||flow.csrf!==form.get('csrf'))throw Object.assign(Error('Authorization session expired. Start again.'),{status:403});
   store.sql.prepare('DELETE FROM mcp_oauth_flows WHERE id_hash=?').run(hash(flowId));
   if(form.get('decision')!=='allow')return redirect(res,issuerRedirect(flow.redirectURI,{error:'access_denied',state:flow.state,iss:issuer}));
   const selectedTenant=form.get('tenant_id')||flow.tenantId;contextForMember(user.id,selectedTenant);
   const code=random(),expires=Date.now()+60000;store.sql.prepare('INSERT INTO mcp_oauth_codes VALUES(?,?,?,?,?,?,?,?,?)').run(hash(code),user.id,selectedTenant,flow.clientId,flow.redirectURI,flow.challenge,flow.scope,flow.resource,expires);
   return redirect(res,issuerRedirect(flow.redirectURI,{code,state:flow.state,iss:issuer}));
  }
  if(p==='/oauth/token'&&req.method==='POST'){
   const form=new URLSearchParams(await readBody(req)),code=form.get('code')||'',row=store.sql.prepare('SELECT * FROM mcp_oauth_codes WHERE code_hash=? AND expires>?').get(hash(code),Date.now());
   if(form.get('grant_type')!=='authorization_code'||!row||form.get('client_id')!==row.client_id||form.get('redirect_uri')!==row.redirect_uri||form.get('resource')!==row.resource||!/^[A-Za-z0-9_-]{43,128}$/.test(form.get('code_verifier')||'')){return json(res,400,{error:'invalid_grant'})}
   const calculated=crypto.createHash('sha256').update(form.get('code_verifier')).digest('base64url');if(calculated!==row.challenge)return json(res,400,{error:'invalid_grant'});
   const user=store.sql.prepare('SELECT active,tenant_id FROM members WHERE id=?').get(row.member_id);if(!user?.active||!store.sql.prepare('SELECT 1 FROM tenant_memberships WHERE member_id=? AND tenant_id=? AND active=1').get(row.member_id,row.tenant_id))return json(res,400,{error:'invalid_grant'});
   const token=random(),expires=Date.now()+3600000;store.sql.exec('BEGIN IMMEDIATE');try{store.sql.prepare('DELETE FROM mcp_oauth_codes WHERE code_hash=?').run(row.code_hash);store.sql.prepare('INSERT INTO mcp_access_tokens VALUES(?,?,?,?,?,?,?)').run(hash(token),row.member_id,row.tenant_id,row.scope,row.resource,expires,now());store.sql.exec('COMMIT')}catch(error){store.sql.exec('ROLLBACK');throw error}
   return json(res,200,{access_token:token,token_type:'Bearer',expires_in:3600,scope:row.scope,resource:row.resource});
  }
  return false;
 }
 function redirect(res,location){res.writeHead(302,{Location:location,'Cache-Control':'no-store','Referrer-Policy':'no-referrer'});res.end()}
 async function approvalRoute(req,res,url,b,ctx){
  if(!url.pathname.startsWith('/api/mcp-proposals'))return false;
  if(!auth.enabled)return json(res,404,{error:'AI edit approvals require workspace SSO'});
  const user=auth.session(req);if(!user)return json(res,401,{error:'Sign in required'});
  const companyId=ctx.companyId,tenantId=user.tenantId;
  if(req.method==='GET'&&url.pathname==='/api/mcp-proposals'){const db=store.read(companyId),rows=store.sql.prepare("SELECT id,quote_id AS quoteId,payload,created FROM mcp_edit_proposals WHERE company_id=? AND tenant_id=? AND status='Pending' ORDER BY created DESC LIMIT 50").all(companyId,tenantId);return json(res,200,{proposals:rows.map(row=>({id:row.id,quoteId:row.quoteId,created:row.created,changes:JSON.parse(row.payload),quote:db.quotes.find(q=>q.id===row.quoteId)})).filter(row=>row.quote)})}
  const match=url.pathname.match(/^\/api\/mcp-proposals\/([0-9a-f-]{36})\/(approve|reject)$/);if(req.method!=='POST'||!match)return json(res,405,{error:'Unsupported proposal action'});
  const [,proposalId,decision]=match,proposal=store.sql.prepare('SELECT * FROM mcp_edit_proposals WHERE id=? AND company_id=? AND tenant_id=?').get(proposalId,companyId,tenantId);if(!proposal)return json(res,404,{error:'Proposal not found'});if(proposal.status!=='Pending')return json(res,409,{error:'Proposal has already been reviewed'});
  if(decision==='reject'){store.sql.prepare("UPDATE mcp_edit_proposals SET status='Rejected',reviewed=? WHERE id=?").run(now(),proposal.id);return json(res,200,{status:'Rejected'})}
  const db=store.read(companyId),quote=db.quotes.find(q=>q.id===proposal.quote_id);if(!quote||quote.status!=='Draft')return json(res,409,{error:'The quotation is no longer a draft'});if(proposal.quote_updated&&(quote.updated||'')!==proposal.quote_updated)return json(res,409,{error:'The quotation changed after this proposal was created. Ask ChatGPT for a fresh proposal.'});
  Object.assign(quote,JSON.parse(proposal.payload));activity(quote,`AI proposed changes approved by ${user.email}`);store.save(db,undefined,companyId);store.sql.prepare("UPDATE mcp_edit_proposals SET status='Approved',reviewed=? WHERE id=?").run(now(),proposal.id);return json(res,200,{status:'Approved',quote:publicQuote(quote)});
 }
 function issueAgentToken(memberId,tenantId,name,days=90){
  contextForMember(memberId,tenantId);name=text(name,'Agent name',{required:true,max:100});
  if(!Number.isInteger(days)||days<1||days>90)throw Error('Token lifetime must be 1–90 days');
  const token=random(),tokenHash=hash(token),tokenId=id(),created=now(),expires=Date.now()+days*86400000;
  store.sql.exec('BEGIN IMMEDIATE');try{
   store.sql.prepare('INSERT INTO mcp_access_tokens VALUES(?,?,?,?,?,?,?)').run(tokenHash,memberId,tenantId,'quotes:read quotes:create quotes:write',resource,expires,created);
   store.sql.prepare('INSERT INTO mcp_named_tokens VALUES(?,?,?,?,?,?)').run(tokenId,tokenHash,memberId,tenantId,name,created);store.sql.exec('COMMIT');
  }catch(e){store.sql.exec('ROLLBACK');throw e}
  return {id:tokenId,name,token,expiresAt:new Date(expires).toISOString(),resource,scopes:['quotes:read','quotes:create','quotes:write']};
 }
 async function route(req,res,url,b={},ctx={}){
  try{
   if(url.pathname==='/mcp'){await handleMCP(req,res);return true}
   if(url.pathname.startsWith('/api/mcp-tokens')){
    if(!auth.enabled)throw Object.assign(Error('Agent tokens require SSO'),{status:404});
    const user=auth.requireOwner(req);
    if(url.pathname==='/api/mcp-tokens'&&req.method==='GET'){json(res,200,{tokens:store.sql.prepare('SELECT n.id,n.name,n.created,t.expires FROM mcp_named_tokens n JOIN mcp_access_tokens t ON t.token_hash=n.token_hash WHERE n.member_id=? AND n.tenant_id=? AND t.expires>?').all(user.id,user.tenantId,Date.now())});return true}
    if(url.pathname==='/api/mcp-tokens'&&req.method==='POST'){json(res,201,issueAgentToken(user.id,user.tenantId,b.name,b.days??90));return true}
    const tokenId=url.pathname.split('/')[3],entry=store.sql.prepare('SELECT token_hash FROM mcp_named_tokens WHERE id=? AND member_id=? AND tenant_id=?').get(tokenId,user.id,user.tenantId);
    if(req.method!=='DELETE'||!entry)throw Object.assign(Error('Agent token not found'),{status:404});
    store.sql.prepare('DELETE FROM mcp_access_tokens WHERE token_hash=?').run(entry.token_hash);store.sql.prepare('DELETE FROM mcp_named_tokens WHERE id=?').run(tokenId);json(res,200,{revoked:true});return true;
   }
   const oauth=await oauthRoute(req,res,url);if(oauth!==false)return true;
   if(url.pathname.startsWith('/api/mcp-proposals')){await approvalRoute(req,res,url,b,ctx);return true}
   return false;
  }catch(error){if(url.pathname.startsWith('/oauth/'))html(res,error.status||400,`<!doctype html><title>Authorization failed</title><p>${safe(error.message)}</p>`);else sendError(res,error);return true}
 }
 return {route,resource,issuer,issueAgentToken};
}
