import crypto from 'node:crypto';

export function turnstileAction(method, pathname) {
 if (method !== 'POST') return null;
 const parts=pathname.split('/').filter(Boolean);
 if(parts[0]!=='api')return null;
 if(parts[1]==='lead-form'&&parts.length===2)return 'enquiry';
 return parts[1]==='shared'?({accept:'quote_accept',decline:'quote_decline',messages:'quote_question',reviews:'quote_review'}[parts[3]]||null):null;
}

export function createTurnstile(env=process.env, request=fetch, sql=null) {
 const siteKey=(env.TURNSTILE_SITE_KEY||'').trim(), secret=(env.TURNSTILE_SECRET||'').trim();
 const enabled=env.NODE_ENV==='production'&&env.DEPLOYMENT_MODE!=='self-hosted'||env.TURNSTILE_REQUIRED==='true'||Boolean(siteKey||secret);
 const hosts=new Set((env.TURNSTILE_HOSTNAMES||'').split(',').map(x=>x.trim().toLowerCase()).filter(Boolean));
 if(enabled&&(!siteKey||!secret||!hosts.size))throw Error('Turnstile requires a site key, secret and allowed frontend hostnames');
 if(env.NODE_ENV==='production'&&[...hosts].some(h=>h==='localhost'||h==='127.0.0.1'||h==='::1'))throw Error('Production Turnstile cannot allow local hostnames');
 // Persist only token hashes. Keep them beyond Turnstile's five-minute token
 // lifetime so retries, concurrent requests and process restarts cannot replay.
 if(enabled&&sql)sql.exec('CREATE TABLE IF NOT EXISTS turnstile_redemptions(token_hash TEXT PRIMARY KEY,expires INTEGER NOT NULL); CREATE INDEX IF NOT EXISTS turnstile_redemptions_expiry ON turnstile_redemptions(expires)');
 const redeemed=new Map();
 function alreadyUsed(digest){
  const time=Date.now();
  if(sql){sql.prepare('DELETE FROM turnstile_redemptions WHERE expires<=?').run(time);return Boolean(sql.prepare('SELECT 1 FROM turnstile_redemptions WHERE token_hash=?').get(digest))}
  for(const [key,expires] of redeemed)if(expires<=time)redeemed.delete(key);
  return redeemed.has(digest);
 }
 function claim(digest){
  const expires=Date.now()+10*60*1000;
  if(sql)return sql.prepare('INSERT OR IGNORE INTO turnstile_redemptions(token_hash,expires) VALUES(?,?)').run(digest,expires).changes===1;
  if(redeemed.has(digest))return false;redeemed.set(digest,expires);return true;
 }
 function fail(action, reason, status=403) {
  const reference=crypto.randomUUID();
  console.warn(JSON.stringify({event:'turnstile_rejected',action,reason,reference}));
  throw Object.assign(Error(status===503?'Security verification is temporarily unavailable. Please try again.':'Security verification failed. Please try again.'),{status});
 }
 return {
  publicConfig(){return enabled?{enabled:true,siteKey}:{enabled:false}},
  async verify(req,input,action){
   if(!enabled)return;
   let hostname;try{hostname=new URL('http://'+req.headers.host).hostname.toLowerCase()}catch{return fail(action,'invalid_hostname')}
   if(!hosts.has(hostname))return fail(action,'unconfigured_hostname',503);
   const token=input?.['cf-turnstile-response'];
   if(typeof token!=='string'||!token.trim()||token.length>2048)return fail(action,'missing_or_invalid_token');
   const digest=crypto.createHash('sha256').update(token).digest('hex');
   if(alreadyUsed(digest))return fail(action,'replayed_token');
   let result;
   try{
    const response=await request('https://challenges.cloudflare.com/turnstile/v0/siteverify',{
     method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},
     signal:AbortSignal.timeout(10000),body:new URLSearchParams({secret,response:token})
    });
    if(!response.ok)throw Error('Upstream verification failed');
    result=await response.json();
   }catch{return fail(action,'upstream_unavailable',503)}
   if(result?.success!==true)return fail(action,'invalid_expired_or_replayed_token');
   if(result.action!==action)return fail(action,'action_mismatch');
   if(result.hostname!==hostname)return fail(action,'hostname_mismatch');
   if(!claim(digest))return fail(action,'replayed_token');
  }
 };
}
