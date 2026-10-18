import crypto from 'node:crypto';
import {createTwoFactor} from './two-factor.mjs';
import {initializeMemberships} from './tenancy.mjs';
import {createTurnstile} from './turnstile.mjs';
import {assertSeatAvailable} from './edition.mjs';
import {initializeRoles,roleClaims,listRoles,saveRole,assignRole} from './roles.mjs';
import {createRemoteJWKSet,jwtVerify} from 'jose';
const random=()=>crypto.randomBytes(32).toString('base64url');
export const hash=value=>crypto.createHash('sha256').update(value).digest('base64url');
const email=v=>typeof v==='string'&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)&&v.length<255;
const fail=(message,status=400)=>Object.assign(Error(message),{status});
const cookie=(req,name)=>String(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith(name+'='))?.slice(name.length+1);
const json=(res,status,data)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(data))};
const redirect=(res,url)=>{res.writeHead(302,{Location:url,'Cache-Control':'no-store','Referrer-Policy':'no-referrer'});res.end()};
export function createAuth(sql,env=process.env,tenantId='tenant-default'){
 const loginVerification=createTurnstile(env,fetch,sql);
 const selfHosted=env.DEPLOYMENT_MODE==='self-hosted';
 const localAccounts=selfHosted&&env.AUTH_MODE==='local';
 const enabled=env.AUTH_MODE==='oidc'||localAccounts;const origin=env.PUBLIC_URL||'http://127.0.0.1:3000';
 const webOrigin=env.WEB_URL?new URL(env.WEB_URL).origin:origin;
 if(env.NODE_ENV==='production'&&!webOrigin.startsWith('https://'))throw Error('WEB_URL must use HTTPS');
 const key=Buffer.from(env.TOKEN_ENCRYPTION_KEY||'','base64');
 if(enabled&&key.length!==32)throw Error('TOKEN_ENCRYPTION_KEY must be a base64-encoded 32-byte key');
 if(env.NODE_ENV==='production'&&selfHosted&&(!enabled||localAccounts)&&(String(env.INTERNAL_PASSWORD||'').length<16||key.length!==32))throw Error('Self-hosted production requires a password of at least 16 characters and a 32-byte TOKEN_ENCRYPTION_KEY');
 if(env.NODE_ENV==='production'&&((!enabled&&!selfHosted)||!origin.startsWith('https://')||!email(env.OWNER_EMAIL)))throw Error('Production requires OIDC, HTTPS PUBLIC_URL and OWNER_EMAIL');
 const tenant=env.MICROSOFT_TENANT_ID;
 const providers={
  google:{id:env.GOOGLE_CLIENT_ID,secret:env.GOOGLE_CLIENT_SECRET,authorize:'https://accounts.google.com/o/oauth2/v2/auth',token:'https://oauth2.googleapis.com/token',jwks:'https://www.googleapis.com/oauth2/v3/certs',issuer:['https://accounts.google.com','accounts.google.com'],mailScope:'https://www.googleapis.com/auth/gmail.send'},
  microsoft:{id:env.MICROSOFT_CLIENT_ID,secret:env.MICROSOFT_CLIENT_SECRET,authorize:`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/authorize`,token:`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`,jwks:`https://login.microsoftonline.com/${tenant}/discovery/v2.0/keys`,issuer:`https://login.microsoftonline.com/${tenant}/v2.0`,mailScope:'https://graph.microsoft.com/Mail.Send'}
 };
 const ready=p=>Boolean(enabled&&providers[p]?.id&&providers[p]?.secret&&(p!=='microsoft'||/^[0-9a-f-]{36}$/i.test(tenant||'')));
 const jwks={};for(const [name,p] of Object.entries(providers))if(ready(name))jwks[name]=createRemoteJWKSet(new URL(p.jwks));
 sql.exec(`CREATE TABLE IF NOT EXISTS members(id TEXT PRIMARY KEY,email TEXT UNIQUE NOT NULL,role TEXT NOT NULL,active INTEGER NOT NULL DEFAULT 1,tenant_id TEXT NOT NULL DEFAULT '${tenantId}');
 CREATE TABLE IF NOT EXISTS identities(provider TEXT NOT NULL,subject TEXT NOT NULL,member_id TEXT NOT NULL REFERENCES members(id),PRIMARY KEY(provider,subject));
 CREATE TABLE IF NOT EXISTS sessions(hash TEXT PRIMARY KEY,member_id TEXT NOT NULL REFERENCES members(id),expires INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS oauth_flows(state TEXT PRIMARY KEY,payload TEXT NOT NULL,expires INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS auth_codes(hash TEXT PRIMARY KEY,member_id TEXT NOT NULL,challenge TEXT NOT NULL,expires INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS mail_grants(code_hash TEXT PRIMARY KEY REFERENCES auth_codes(hash) ON DELETE CASCADE,payload TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS mailboxes(member_id TEXT NOT NULL,provider TEXT NOT NULL,email TEXT NOT NULL,secret TEXT NOT NULL,status TEXT NOT NULL,PRIMARY KEY(member_id,provider));`);
 if(!sql.prepare('PRAGMA table_info(members)').all().some(c=>c.name==='tenant_id'))sql.exec(`ALTER TABLE members ADD COLUMN tenant_id TEXT NOT NULL DEFAULT '${tenantId}'`);
 sql.prepare('UPDATE members SET tenant_id=? WHERE tenant_id IS NULL OR tenant_id=\'\'').run(tenantId);
 if(enabled)sql.prepare('INSERT OR IGNORE INTO members(id,email,role,tenant_id) VALUES(?,?,?,?)').run(crypto.randomUUID(),env.OWNER_EMAIL.toLowerCase(),'owner',tenantId);
 initializeMemberships(sql);
 initializeRoles(sql);
 function seal(value){const iv=crypto.randomBytes(12),c=crypto.createCipheriv('aes-256-gcm',key,iv);const encrypted=Buffer.concat([c.update(JSON.stringify(value)),c.final()]);return Buffer.concat([iv,c.getAuthTag(),encrypted]).toString('base64')}
 function open(value){const raw=Buffer.from(value,'base64'),d=crypto.createDecipheriv('aes-256-gcm',key,raw.subarray(0,12));d.setAuthTag(raw.subarray(12,28));return JSON.parse(Buffer.concat([d.update(raw.subarray(28)),d.final()]).toString())}
 const twoFactor=createTwoFactor(sql,{seal,open});
 // Cache identifiers are process-local MACs, never reusable password hashes.
 const cacheSecret=crypto.randomBytes(32);
 const credentialKey=(address,password)=>crypto.createHmac('sha256',cacheSecret).update(JSON.stringify([address.toLowerCase(),password])).digest('base64url');
 const credentialCache=new Map(),basicAttempts=new Map();
 if(localAccounts){
  sql.exec('CREATE TABLE IF NOT EXISTS local_passwords(member_id TEXT PRIMARY KEY REFERENCES members(id),salt TEXT NOT NULL,digest TEXT NOT NULL)');
  const owner=sql.prepare('SELECT id FROM members WHERE email=?').get(env.OWNER_EMAIL.toLowerCase());
  if(owner&&!sql.prepare('SELECT 1 FROM local_passwords WHERE member_id=?').get(owner.id))setLocalPassword(owner.id,env.INTERNAL_PASSWORD);
 }
 function setLocalPassword(memberId,password){
  if(typeof password!=='string'||password.length<16||password.length>256)throw fail('Use a password between 16 and 256 characters');
  const salt=crypto.randomBytes(24).toString('hex'),digest=crypto.scryptSync(password,salt,64).toString('hex');
  sql.prepare('INSERT INTO local_passwords VALUES(?,?,?) ON CONFLICT(member_id) DO UPDATE SET salt=excluded.salt,digest=excluded.digest').run(memberId,salt,digest);
  credentialCache.clear();sql.prepare('DELETE FROM sessions WHERE member_id=?').run(memberId);
 }
 function localMember(address,password){
  if(!localAccounts||typeof password!=='string'||password.length>256||typeof address!=='string')return null;
  const cacheKey=credentialKey(address,password),cached=credentialCache.get(cacheKey);
  if(cached&&cached.until>Date.now())return sql.prepare('SELECT id,email,tenant_id FROM members WHERE id=? AND active=1').get(cached.id)||null;
  const row=sql.prepare('SELECT m.id,m.email,m.tenant_id,p.salt,p.digest FROM members m JOIN local_passwords p ON p.member_id=m.id WHERE m.email=? AND m.active=1').get(address.toLowerCase());
  const digest=crypto.scryptSync(password,row?.salt||'dowi-local-login-dummy-salt',64),expected=Buffer.from(row?.digest||'0'.repeat(128),'hex');
  if(!row||!crypto.timingSafeEqual(digest,expected))return null;
  if(credentialCache.size>=100)credentialCache.clear();credentialCache.set(cacheKey,{id:row.id,until:Date.now()+5*60000});
  return {id:row.id,email:row.email,tenant_id:row.tenant_id};
 }
 function basicMember(req){
  if(!localAccounts||!req.headers.authorization?.startsWith('Basic '))return null;
  const header=req.headers.authorization,ip=String(req.socket?.remoteAddress||'local'),now=Date.now();
  const value=Buffer.from(header.slice(6),'base64').toString('utf8'),colon=value.indexOf(':');
  const cached=colon>=0?credentialCache.get(credentialKey(value.slice(0,colon),value.slice(colon+1))):null;
  if(!cached||cached.until<=now){
   let attempts=basicAttempts.get(ip);if(!attempts||attempts.until<=now){attempts={count:0,until:now+60000};basicAttempts.set(ip,attempts)}
   if(++attempts.count>10)return null;
   if(basicAttempts.size>10000)for(const [key,entry] of basicAttempts)if(entry.until<=now)basicAttempts.delete(key);
  }
  const user=colon<0?null:localMember(value.slice(0,colon),value.slice(colon+1));return user&&!twoFactor.enabled(user.id)?user:null;
 }
 function session(req){const value=req.headers.authorization?.startsWith('Bearer ')?req.headers.authorization.slice(7):cookie(req,'dowi_session');if(!value&&!localAccounts)return null;
 const user=basicMember(req)||sql.prepare('SELECT m.id,m.email,m.tenant_id FROM sessions s JOIN members m ON m.id=s.member_id WHERE s.hash=? AND s.expires>? AND m.active=1').get(hash(value||''),Date.now());if(!user)return null;
 const membership=req.workspaceTenantId?sql.prepare('SELECT tenant_id,role FROM tenant_memberships WHERE member_id=? AND tenant_id=? AND active=1').get(user.id,req.workspaceTenantId):sql.prepare('SELECT tenant_id,role FROM tenant_memberships WHERE member_id=? AND active=1 ORDER BY (tenant_id=?) DESC,tenant_id LIMIT 1').get(user.id,user.tenant_id);
 return membership?{id:user.id,email:user.email,role:membership.role,tenantId:membership.tenant_id,...roleClaims(sql,user.id,membership.tenant_id,membership.role)}:null;
 }

 function issue(memberId){const token=random(),expires=Date.now()+7*86400000;sql.prepare('INSERT INTO sessions VALUES(?,?,?)').run(hash(token),memberId,expires);return {token,expiresAt:new Date(expires).toISOString()}}
 function boxes(user){return user?sql.prepare('SELECT provider,email,status FROM mailboxes WHERE member_id=?').all(user.id):[]}
 function requireUser(req){const user=session(req);if(!user)throw fail('Sign in required',401);return user}
 function requireOwner(req){const u=requireUser(req);if(u.role!=='owner')throw fail('Administrator access required',403);return u}
 async function tokenRequest(provider,fields){const p=providers[provider];const r=await fetch(p.token,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:p.id,client_secret:p.secret,...fields}),signal:AbortSignal.timeout(15000)});const data=await r.json();if(!r.ok)throw fail('Mailbox authorization expired or denied. Reconnect your account.',401);return data}
 async function route(req,res,url,b){
  if(!enabled)return false;
  const p=url.pathname;
  if(p==='/api/auth/two-factor/verify'&&req.method==='POST'){
   const completed=twoFactor.complete(cookie(req,'dowi_mfa')||b.challenge,b.code);
   if(!sql.prepare('SELECT 1 FROM members WHERE id=? AND active=1').get(completed.memberId))throw fail('Account is no longer active',403);
   res.setHeader('Set-Cookie','dowi_mfa=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0');
   const flow=completed.payload;
   if(flow.native){const code=random();sql.prepare('INSERT INTO auth_codes VALUES(?,?,?,?)').run(hash(code),completed.memberId,flow.challenge,Date.now()+60000);json(res,200,{url:'dowi-quotes://auth?code='+code});return true}
   const issued=issue(completed.memberId);res.setHeader('Set-Cookie',[`dowi_session=${issued.token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=604800`,'dowi_mfa=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0']);json(res,200,flow.nativeLocal?issued:{url:flow.returnTo||(flow.tenantCode?'/'+flow.tenantCode+'/dashboard':'/')});return true;
  }
  if(p.startsWith('/api/auth/two-factor')){
   const user=requireUser(req);
   if(p==='/api/auth/two-factor'&&req.method==='GET'){json(res,200,twoFactor.status(user.id));return true}
   if(p==='/api/auth/two-factor/enroll'&&req.method==='POST'){json(res,200,twoFactor.enroll(user.id,user.email));return true}
   if(p==='/api/auth/two-factor/confirm'&&req.method==='POST'){
    if(twoFactor.enabled(user.id))throw fail('Two-step verification is already enabled',409);
    const result=twoFactor.confirm(user.id,b.code),current=req.headers.authorization?.replace(/^Bearer /,'')||cookie(req,'dowi_session')||'';
    sql.prepare('DELETE FROM sessions WHERE member_id=? AND hash<>?').run(user.id,hash(current));sql.prepare('DELETE FROM auth_codes WHERE member_id=?').run(user.id);credentialCache.clear();json(res,200,result);return true;
   }
   if(p==='/api/auth/two-factor/disable'&&req.method==='POST'){twoFactor.disable(user.id,b.code);json(res,200,{enabled:false});return true}
   if(p==='/api/auth/two-factor/recovery-codes'&&req.method==='POST'){twoFactor.verify(user.id,b.code);json(res,200,{recoveryCodes:twoFactor.recoveryCodes(user.id)});return true}
  }
  if(p==='/api/auth/config'&&req.method==='GET'){json(res,200,{localAccounts,turnstile:loginVerification.publicConfig(),providers:Object.keys(providers).map(id=>({id,enabled:ready(id)}))});return true}
  if(localAccounts&&p==='/api/auth/local-login'&&req.method==='POST'){
   if(b.native===true&&req.headers.origin)throw fail('Use browser sign-in for web requests',403);
   if(b.native!==true)await loginVerification.verify(req,b,'login');
   const user=localMember(b.email,b.password);if(!user)throw fail('Invalid email or password',401);
   if(twoFactor.enabled(user.id)){const challenge=twoFactor.challenge(user.id,{nativeLocal:b.native===true&&!req.headers.origin});res.setHeader('Set-Cookie',`dowi_mfa=${challenge}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=300`);json(res,202,{requiresTwoFactor:true,url:'/two-factor.html',...(b.native===true&&!req.headers.origin?{challenge}:{})});return true}
   const issued=issue(user.id);res.setHeader('Set-Cookie',`dowi_session=${issued.token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=604800`);json(res,200,b.native===true&&!req.headers.origin?issued:{ok:true});return true;
  }
  if(localAccounts&&p==='/api/auth/local-password'&&req.method==='POST'){
   const user=requireUser(req);if(!localMember(user.email,b.currentPassword))throw fail('Current password is incorrect',403);
   setLocalPassword(user.id,b.password);json(res,200,{ok:true});return true;
  }
  if(localAccounts&&/^\/api\/members\/[^/]+\/password$/.test(p)&&req.method==='POST'){
   const owner=requireOwner(req),memberId=p.split('/')[3];
   if(!sql.prepare('SELECT 1 FROM tenant_memberships WHERE member_id=? AND tenant_id=? AND active=1').get(memberId,owner.tenantId))throw fail('Member not found',404);
   if(memberId!==owner.id&&sql.prepare('SELECT 1 FROM tenant_memberships WHERE member_id=? AND tenant_id<>? AND active=1').get(memberId,owner.tenantId))throw fail('This member manages their password in another company. Ask them to change it themselves.',409);
   setLocalPassword(memberId,b.password);json(res,200,{ok:true});return true;
  }
  if(p==='/api/auth/me'&&req.method==='GET'){const user=requireUser(req);json(res,200,{user,mailboxes:boxes(user)});return true}
  if(p==='/api/auth/logout'&&req.method==='POST'){const t=req.headers.authorization?.replace(/^Bearer /,'')||cookie(req,'dowi_session')||'';sql.prepare('DELETE FROM sessions WHERE hash=?').run(hash(t));res.setHeader('Set-Cookie','dowi_session=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0');json(res,200,{ok:true});return true}
  if(p==='/api/auth/start'&&req.method==='POST'){
   const provider=b.provider;if(!ready(provider))throw fail('This sign-in provider is not configured yet',503);
   const native=b.native===true,mail=b.intent==='mail';const user=mail?requireUser(req):null;
   if(native&&req.headers.origin)throw fail('Use browser sign-in for web requests',403);
   if(!native)await loginVerification.verify(req,b,'login');
   const returnTo=typeof b.returnTo==='string'&&/^\/oauth\/authorize\?flow=[A-Za-z0-9_-]{43}$/.test(b.returnTo)?b.returnTo:'';
   if(native&&!/^[A-Za-z0-9_-]{43}$/.test(b.challenge||''))throw fail('Invalid application challenge');
   const callbackOrigin=!native&&req.headers.host===new URL(webOrigin).host?webOrigin:origin;
   const state=random(),verifier=random(),nonce=random(),binding=random();const flow={provider,verifier,nonce,native,callbackOrigin,tenantCode:/^\d+$/.test(String(b.tenant||''))?String(b.tenant):'',challenge:b.challenge||'',memberId:user?.id||null,binding:hash(binding),mail,returnTo};
   sql.prepare('DELETE FROM oauth_flows WHERE expires<?').run(Date.now());sql.prepare('DELETE FROM auth_codes WHERE expires<?').run(Date.now());sql.prepare('DELETE FROM sessions WHERE expires<?').run(Date.now());
   sql.prepare('INSERT INTO oauth_flows VALUES(?,?,?)').run(hash(state),seal(flow),Date.now()+600000);
   if(!native)res.setHeader('Set-Cookie',`dowi_oauth=${binding}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=600`);
   const config=providers[provider],target=new URL(config.authorize);
   const scopes=['openid','email','profile',...(provider==='microsoft'?['offline_access']:[]),...(mail?[config.mailScope]:[])];
   const params={client_id:config.id,redirect_uri:callbackOrigin+`/auth/${provider}/callback`,response_type:'code',scope:scopes.join(' '),state,nonce,code_challenge:hash(verifier),code_challenge_method:'S256',prompt:mail?'consent':'select_account',...(provider==='google'?{access_type:'offline'}:{})};
   for(const [k,v] of Object.entries(params))target.searchParams.set(k,v);json(res,200,{url:target.href});return true;
  }
  if(/^\/auth\/(google|microsoft)\/callback$/.test(p)&&req.method==='GET'){
   const state=url.searchParams.get('state')||'',entry=sql.prepare('SELECT * FROM oauth_flows WHERE state=? AND expires>?').get(hash(state),Date.now());if(!entry)throw fail('Sign-in session expired. Please try again.');
   const flow=open(entry.payload);sql.prepare('DELETE FROM oauth_flows WHERE state=?').run(hash(state));
   if(flow.provider!==p.split('/')[2]||!flow.native&&hash(cookie(req,'dowi_oauth')||'')!==flow.binding)throw fail('Invalid sign-in session',403);
   if(url.searchParams.has('error')){redirect(res,flow.native?'dowi-quotes://auth?error=cancelled':'/login?error=cancelled');return true}
   const callbackOrigin=flow.callbackOrigin||origin;
   if(![origin,webOrigin].includes(callbackOrigin))throw fail('Sign-in origin is no longer configured',403);
   const config=providers[flow.provider],tokens=await tokenRequest(flow.provider,{grant_type:'authorization_code',code:url.searchParams.get('code')||'',redirect_uri:callbackOrigin+p,code_verifier:flow.verifier});
   const {payload}=await jwtVerify(tokens.id_token,jwks[flow.provider],{audience:config.id,issuer:config.issuer,algorithms:['RS256'],requiredClaims:['sub','exp','iat','nonce']});
   if(payload.nonce!==flow.nonce||flow.provider==='google'&&payload.email_verified!==true||flow.provider==='microsoft'&&(payload.tid!==tenant||typeof payload.oid!=='string'||!payload.oid))throw fail('Could not verify account identity',403);
   const address=String(payload.email||payload.preferred_username||'').toLowerCase();if(!email(address))throw fail('Account has no verified email address',403);
   const subject=flow.provider==='microsoft'?`${payload.tid}:${payload.oid}`:payload.sub;
   let user,pendingMailbox;
   if(flow.mail){user=sql.prepare('SELECT * FROM members WHERE id=? AND active=1').get(flow.memberId);if(!user)throw fail('Membership is no longer active',403);
    if(!tokens.scope?.split(' ').some(s=>s===config.mailScope||flow.provider==='microsoft'&&s==='Mail.Send'))throw fail('Mail sending permission was not granted',403);
    const previous=sql.prepare('SELECT secret FROM mailboxes WHERE member_id=? AND provider=?').get(user.id,flow.provider);const old=previous?open(previous.secret):{};
    if(!tokens.refresh_token&&old.subject!==subject)throw fail('Offline access was not granted. Please reconnect.',403);
    pendingMailbox={memberId:user.id,provider:flow.provider,address,secret:seal({...tokens,subject,refresh_token:tokens.refresh_token||old.refresh_token,expires:Date.now()+tokens.expires_in*1000})};
    if(!flow.native)saveMailbox(pendingMailbox);
   }else{
    user=sql.prepare('SELECT m.* FROM identities i JOIN members m ON m.id=i.member_id WHERE i.provider=? AND i.subject=? AND m.active=1').get(flow.provider,subject);
    if(!user){user=sql.prepare('SELECT * FROM members WHERE email=? AND active=1').get(address);if(!user)throw fail('Ask your workspace administrator to add your email before signing in.',403);
     if(sql.prepare('SELECT 1 FROM identities WHERE member_id=?').get(user.id))throw fail('Use the sign-in provider already linked to this member.',403);
     sql.prepare('INSERT INTO identities VALUES(?,?,?)').run(flow.provider,subject,user.id);
    }
   }
   if(!flow.mail&&twoFactor.enabled(user.id)){const token=twoFactor.challenge(user.id,{native:flow.native,challenge:flow.challenge,returnTo:flow.returnTo,tenantCode:flow.tenantCode});res.setHeader('Set-Cookie',`dowi_mfa=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=300`);redirect(res,'/two-factor.html');return true}
   if(flow.native){const code=random();sql.prepare('INSERT INTO auth_codes VALUES(?,?,?,?)').run(hash(code),user.id,flow.challenge,Date.now()+60000);if(pendingMailbox)sql.prepare('INSERT INTO mail_grants VALUES(?,?)').run(hash(code),seal(pendingMailbox));redirect(res,'dowi-quotes://auth?code='+code)}else{if(!flow.mail){const issued=issue(user.id);res.setHeader('Set-Cookie',`dowi_session=${issued.token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=604800`)}redirect(res,flow.mail?(flow.tenantCode?'/'+flow.tenantCode+'/account':'/account'):flow.returnTo||(flow.tenantCode?'/'+flow.tenantCode+'/dashboard':'/'))}
   return true;
  }
  if(p==='/api/auth/exchange'&&req.method==='POST'){
   const entry=sql.prepare('SELECT * FROM auth_codes WHERE hash=? AND expires>?').get(hash(String(b.code||'')),Date.now());
   if(!entry||!/^[a-zA-Z0-9_-]{43,128}$/.test(b.verifier||'')||entry.challenge!==hash(b.verifier))throw fail('Invalid or expired sign-in code',401);
   if(!sql.prepare('SELECT 1 FROM members WHERE id=? AND active=1').get(entry.member_id))throw fail('Membership is no longer active',403);
   sql.exec('BEGIN IMMEDIATE');let issued;try{
    const grant=sql.prepare('SELECT payload FROM mail_grants WHERE code_hash=?').get(entry.hash);if(grant){const mailbox=open(grant.payload);if(mailbox.memberId!==entry.member_id)throw fail('Invalid mailbox grant',403);saveMailbox(mailbox)}
    sql.prepare('DELETE FROM auth_codes WHERE hash=?').run(entry.hash);issued=issue(entry.member_id);sql.exec('COMMIT');
   }catch(error){sql.exec('ROLLBACK');throw error}json(res,200,issued);return true;
  }
  if(p==='/api/members'){
   const owner=requireOwner(req);
   if(req.method==='GET'){json(res,200,sql.prepare('SELECT m.id,m.email,tm.role,tm.active FROM tenant_memberships tm JOIN members m ON m.id=tm.member_id WHERE tm.tenant_id=?').all(owner.tenantId).map(m=>({...m,...roleClaims(sql,m.id,owner.tenantId,m.role)})));return true}
   if(req.method==='POST'){
    const address=String(b.email||'').trim().toLowerCase();if(!email(address))throw fail('Enter a valid email');
    sql.exec('BEGIN IMMEDIATE');try{
     const created=sql.prepare("INSERT OR IGNORE INTO members(id,email,role,active,tenant_id) VALUES(?,?,'member',1,?)").run(crypto.randomUUID(),address,owner.tenantId).changes===1;
     const member=sql.prepare('SELECT id,active FROM members WHERE email=?').get(address);if(!member.active)throw fail('This account has been disabled',403);
     if(localAccounts&&b.password&&!created)throw fail('This account already exists. Leave the initial password blank to add its existing account; password resets use the separate password action.',409);
     if(localAccounts&&created&&!b.password)throw fail('Provide an initial password for a new local account');
     assertSeatAvailable(sql,owner.tenantId,member.id,{localLimit:env.WEB_USER_LIMIT||env.PRIVATE_SERVER_SEATS||10000});
     sql.prepare("INSERT INTO tenant_memberships VALUES(?,?,'member',1) ON CONFLICT(member_id,tenant_id) DO UPDATE SET active=1").run(member.id,owner.tenantId);
     if(localAccounts&&created)setLocalPassword(member.id,b.password);
     if(b.roleId)assignRole(sql,owner.tenantId,member.id,b.roleId);
     sql.exec('COMMIT');
    }catch(e){sql.exec('ROLLBACK');throw e}json(res,201,{ok:true});return true;
   }
  }
  if(p==='/api/roles'||p.startsWith('/api/roles/')){
   const owner=requireOwner(req),roleId=p.split('/')[3];
   if(req.method==='GET'&&!roleId){json(res,200,listRoles(sql,owner.tenantId));return true}
   if(req.method==='POST'&&!roleId||req.method==='PUT'&&roleId){json(res,req.method==='POST'?201:200,saveRole(sql,owner.tenantId,b,roleId));return true}
  }
  if(p.startsWith('/api/members/')&&req.method==='PATCH'){
   const owner=requireOwner(req);assignRole(sql,owner.tenantId,p.split('/')[3],b.roleId);json(res,200,{ok:true});return true;
  }
  if(p.startsWith('/api/members/')&&req.method==='DELETE'){
   const owner=requireOwner(req),memberId=p.split('/')[3];const membership=sql.prepare('SELECT role FROM tenant_memberships WHERE member_id=? AND tenant_id=? AND active=1').get(memberId,owner.tenantId);
   if(!membership)throw fail('Member not found',404);if(membership.role==='owner')throw fail('The owner cannot be removed');
   sql.prepare('UPDATE tenant_memberships SET active=0 WHERE member_id=? AND tenant_id=?').run(memberId,owner.tenantId);json(res,200,{ok:true});return true;
  }
  if(p.startsWith('/api/mailboxes/')&&req.method==='DELETE'){const user=requireUser(req);sql.prepare('DELETE FROM mailboxes WHERE member_id=? AND provider=?').run(user.id,p.split('/')[3]);json(res,200,{ok:true});return true}
  return false;
 }
 function saveMailbox(box){sql.prepare('INSERT INTO mailboxes VALUES(?,?,?,?,?) ON CONFLICT(member_id,provider) DO UPDATE SET email=excluded.email,secret=excluded.secret,status=excluded.status').run(box.memberId,box.provider,box.address,box.secret,'Connected')}
 async function send(delivery){
  if(!sql.prepare('SELECT 1 FROM tenant_memberships WHERE member_id=? AND tenant_id=? AND active=1').get(delivery.memberId,delivery.tenantId||tenantId))throw Object.assign(Error('Company membership is no longer active'),{responseCode:403});
  const row=sql.prepare('SELECT b.* FROM mailboxes b JOIN members m ON b.member_id=m.id WHERE b.member_id=? AND b.provider=? AND m.active=1').get(delivery.memberId,delivery.provider);
  if(!row)throw Object.assign(Error('Connect your mailbox before sending.'),{responseCode:401});
  let tokens=open(row.secret);
  if(!tokens.access_token||tokens.expires<Date.now()+60000){try{const refreshed=await tokenRequest(row.provider,{grant_type:'refresh_token',refresh_token:tokens.refresh_token});tokens={...tokens,...refreshed,expires:Date.now()+refreshed.expires_in*1000};sql.prepare('UPDATE mailboxes SET secret=?,status=? WHERE member_id=? AND provider=?').run(seal(tokens),'Connected',row.member_id,row.provider)}catch(e){sql.prepare("UPDATE mailboxes SET status='Reconnect required' WHERE member_id=? AND provider=?").run(row.member_id,row.provider);throw Object.assign(e,{responseCode:401})}}
  let target,body;
  if(row.provider==='microsoft'){target='https://graph.microsoft.com/v1.0/me/sendMail';body={message:{subject:delivery.subject,body:{contentType:'Text',content:delivery.text},toRecipients:[{emailAddress:{address:delivery.recipient}}]},saveToSentItems:true}}
  else{target='https://gmail.googleapis.com/gmail/v1/users/me/messages/send';const safe=v=>String(v).replace(/[\r\n]/g,'');const mime=`From: ${safe(row.email)}\r\nTo: ${safe(delivery.recipient)}\r\nSubject: =?UTF-8?B?${Buffer.from(delivery.subject).toString('base64')}?=\r\nMIME-Version: 1.0\r\nContent-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\nMessage-ID: <${delivery.id}@${safe(row.email).split('@')[1]||'quotes.example'}>\r\n\r\n${Buffer.from(delivery.text).toString('base64').match(/.{1,76}/g).join('\r\n')}\r\n`;body={raw:Buffer.from(mime).toString('base64url')}}
  const response=await fetch(target,{method:'POST',headers:{Authorization:`Bearer ${tokens.access_token}`,'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(20000)});
  if(!response.ok)throw Object.assign(Error(`Email provider rejected the request (${response.status})`),{responseCode:response.status});await response.body?.cancel();return {accepted:[delivery.recipient]};
 }
 return {enabled,localAccounts,session,route,boxes,send,requireOwner,requireUser};
}
