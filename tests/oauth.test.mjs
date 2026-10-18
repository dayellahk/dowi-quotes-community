import {test} from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {generateKeyPair,exportJWK,SignJWT} from 'jose';
import {createStore} from '../lib/store.mjs';
import {createAuth,hash} from '../lib/auth.mjs';

test('OAuth verifies signed identities and PKCE before linking native mailboxes, then refreshes delegated tokens',async()=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'dowi-oauth-'));
 const store=createStore(path.join(directory,'workspace.json'));
 const originalFetch=globalThis.fetch;
 const {privateKey,publicKey}=await generateKeyPair('RS256');
 const jwk={...await exportJWK(publicKey),kid:'test-key',alg:'RS256',use:'sig'};
 const tenant='12345678-1234-1234-1234-123456789abc';
 const auth=createAuth(store.sql,{AUTH_MODE:'oidc',OWNER_EMAIL:'owner@example.com',PUBLIC_URL:'https://quotes.example.com',WEB_URL:'https://app.quotes.example.com',TOKEN_ENCRYPTION_KEY:crypto.randomBytes(32).toString('base64'),GOOGLE_CLIENT_ID:'google-client',GOOGLE_CLIENT_SECRET:'google-secret',MICROSOFT_CLIENT_ID:'microsoft-client',MICROSOFT_CLIENT_SECRET:'microsoft-secret',MICROSOFT_TENANT_ID:tenant});
 let authorization,provider,badNonce=false,refreshes=0;const submissions=[];
 globalThis.fetch=async(url,options={})=>{
  url=String(url);
  if(url.includes('/certs')||url.endsWith('/keys'))return Response.json({keys:[jwk]});
  if(url.endsWith('/token')){
   const params=options.body;
   if(params.get('grant_type')==='refresh_token'){refreshes++;return Response.json({access_token:'refreshed-access',refresh_token:'rotated-refresh',expires_in:3600})}
   assert.equal(hash(params.get('code_verifier')),authorization.searchParams.get('code_challenge'));
   assert.equal(params.get('redirect_uri'),authorization.searchParams.get('redirect_uri'));
   const mail=authorization.searchParams.get('scope').includes('send')||authorization.searchParams.get('scope').includes('Mail.Send');
   const claims={nonce:badNonce?'wrong-nonce':authorization.searchParams.get('nonce'),email:'owner@example.com',email_verified:true,...(provider==='microsoft'?{tid:tenant,oid:'test-microsoft-user'}:{})};
   const idToken=await new SignJWT(claims).setProtectedHeader({alg:'RS256',kid:'test-key'}).setSubject(provider+'-subject').setIssuer(provider==='google'?'https://accounts.google.com':`https://login.microsoftonline.com/${tenant}/v2.0`).setAudience(provider+'-client').setIssuedAt().setExpirationTime('5m').sign(privateKey);
   return Response.json({id_token:idToken,access_token:'initial-access',refresh_token:'private-refresh-token',expires_in:1,scope:mail?(provider==='google'?'https://www.googleapis.com/auth/gmail.send':'Mail.Send'):'openid email profile'});
  }
  if(url.includes('/send')){assert.equal(options.headers.Authorization,'Bearer refreshed-access');submissions.push({url,body:JSON.parse(options.body)});return new Response(null,{status:202})}
  throw Error('Unexpected network request in isolated test: '+url);
 };
 async function route(method,url,body={},token,requestHeaders={}){const headers={},res={writeHead(status,h={}){this.status=status;Object.assign(headers,h)},setHeader(k,v){headers[k]=v},end(value){this.body=value}};await auth.route({method,headers:{...requestHeaders,...(token?{authorization:'Bearer '+token}:{})}},res,new URL(url,'https://quotes.example.com'),body);return {status:res.status,headers,data:res.body?JSON.parse(res.body):undefined}}
 async function start(which,intent,token){provider=which;const verifier=crypto.randomBytes(32).toString('base64url');const result=await route('POST','/api/auth/start',{provider,intent,native:true,challenge:hash(verifier)},token);authorization=new URL(result.data.url);assert.equal(authorization.searchParams.get('redirect_uri'),`https://quotes.example.com/auth/${provider}/callback`);return {verifier,state:authorization.searchParams.get('state')}}
 async function callback(flow){const result=await route('GET',`/auth/${provider}/callback?state=${flow.state}&code=provider-code`);return new URL(result.headers.Location).searchParams.get('code')}
 try{
  let flow=await start('google','login');badNonce=true;await assert.rejects(()=>callback(flow),/verify account/);badNonce=false;
  flow=await start('google','login');let code=await callback(flow);assert.equal(store.sql.prepare('SELECT count(*) n FROM sessions').get().n,0);
  const session=(await route('POST','/api/auth/exchange',{code,verifier:flow.verifier})).data.token;
  const member=auth.session({headers:{authorization:'Bearer '+session}});assert.equal(member.email,'owner@example.com');
  for(const which of ['google','microsoft']){
   flow=await start(which,'mail',session);code=await callback(flow);
   assert(!auth.boxes(member).some(b=>b.provider===which),'OAuth callback alone must not attach a mailbox');
   await assert.rejects(()=>route('POST','/api/auth/exchange',{code,verifier:'x'.repeat(43)}),/Invalid/);
   assert(!auth.boxes(member).some(b=>b.provider===which));
   await route('POST','/api/auth/exchange',{code,verifier:flow.verifier});
   assert(auth.boxes(member).some(b=>b.provider===which&&b.status==='Connected'));
   await assert.rejects(()=>route('POST','/api/auth/exchange',{code,verifier:flow.verifier}),/Invalid/);
   const stored=store.sql.prepare('SELECT secret FROM mailboxes WHERE provider=?').get(which).secret;assert(!stored.includes('private-refresh-token'));
   await auth.send({id:crypto.randomUUID(),memberId:member.id,provider:which,recipient:'test@example.com',subject:'Delegated mail test',text:'Test quotation'});
  }
  provider='google';
  const webStart=await route('POST','/api/auth/start',{provider},undefined,{host:'app.quotes.example.com'});
  authorization=new URL(webStart.data.url);
  assert.equal(authorization.searchParams.get('redirect_uri'),'https://app.quotes.example.com/auth/google/callback');
  const browserCookie=webStart.headers['Set-Cookie'].split(';')[0];
  assert(!webStart.headers['Set-Cookie'].includes('Domain='));
  const webResult=await route('GET','/auth/google/callback?code=web-code&state='+authorization.searchParams.get('state'),{},undefined,{host:'app.quotes.example.com',cookie:browserCookie});
  assert.equal(webResult.headers.Location,'/');assert.match(webResult.headers['Set-Cookie'],/^dowi_session=/);
  assert(!webResult.headers['Set-Cookie'].includes('Domain='));
  assert.equal(refreshes,2);assert.equal(submissions.length,2);assert.equal(submissions[1].body.message.toRecipients[0].emailAddress.address,'test@example.com');
  assert.match(Buffer.from(submissions[0].body.raw,'base64url').toString(),/Message-ID: <[^\r\n@]+@example\.com>/);
  assert.equal(store.sql.prepare('SELECT count(*) n FROM mail_grants').get().n,0);
  await route('DELETE','/api/mailboxes/google',{},session);await assert.rejects(()=>auth.send({memberId:member.id,provider:'google'}),/Connect your mailbox/);
 }finally{globalThis.fetch=originalFetch;store.close();fs.rmSync(directory,{recursive:true,force:true})}
});
